import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BodyModel, RegionId, Segment } from '../lib/bodyModel';

export type Layer = 'normal' | 'fat' | 'muscle' | 'balance';
export type CameraPreset = 'front' | 'back' | 'left' | 'right';

const FOV = 32;

/** Distance that fits the whole figure in frame with margin, from height and FOV. */
const fitDistance = (heightM: number) =>
  (heightM * 1.28) / (2 * Math.tan((FOV * Math.PI) / 360));

const COLORS = {
  neutral: 0x8f9bb3,
  muscle: 0x5eead4,
  fat: 0xf0b866,
  high: 0x7dd3fc,
  low: 0xf6a6a6,
  unmeasured: 0x59617a,
};

/** Catmull-Rom through the control radii, so the silhouette reads as a body not a stack. */
function resample(values: number[], count = 48): number[] {
  const n = values.length - 1;
  const at = (i: number) => values[Math.max(0, Math.min(n, i))];

  return Array.from({ length: count }, (_, k) => {
    const t = (k / (count - 1)) * n;
    const i = Math.floor(t);
    const f = t - i;
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    return Math.max(
      0.0005,
      0.5 *
        (2 * p1 +
          (-p0 + p2) * f +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
          (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f),
    );
  });
}

function latheFor(radii: number[], length: number): THREE.LatheGeometry {
  const smooth = resample(radii);
  const points = smooth.map(
    (r, i) => new THREE.Vector2(r, -(i / (smooth.length - 1)) * length),
  );
  return new THREE.LatheGeometry(points, 48);
}

function colorFor(segment: Segment, layer: Layer, model: BodyModel): number {
  if (!segment.measured) return COLORS.unmeasured;

  const measured = model.segments.filter((s) => s.measured);

  // Intensity is relative to this person's own segments — never to a population norm.
  const scale = (value: number, values: number[]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return max - min < 1e-6 ? 0.5 : (value - min) / (max - min);
  };

  if (layer === 'fat') {
    const t = scale(segment.fatShare, measured.map((s) => s.fatShare));
    return new THREE.Color(COLORS.neutral).lerp(new THREE.Color(COLORS.fat), t).getHex();
  }

  if (layer === 'muscle') {
    const t = scale(segment.muscleShare, measured.map((s) => s.muscleShare));
    return new THREE.Color(COLORS.neutral).lerp(new THREE.Color(COLORS.muscle), t).getHex();
  }

  if (layer === 'balance') {
    const pair = segment.id.includes('arm')
      ? model.asymmetry.arms
      : segment.id.includes('leg')
        ? model.asymmetry.legs
        : 0;
    if (pair === 0) return COLORS.neutral;

    const heavier = pair > 0 ? 'left' : 'right';
    const isHeavier = segment.id.startsWith(heavier);
    const strength = Math.min(1, Math.abs(pair) * 12);
    return new THREE.Color(COLORS.neutral)
      .lerp(new THREE.Color(isHeavier ? COLORS.high : COLORS.low), strength)
      .getHex();
  }

  return COLORS.neutral;
}

export function BodyView({
  model,
  layer,
  selected,
  onSelect,
  preset,
}: {
  model: BodyModel;
  layer: Layer;
  selected: RegionId | null;
  onSelect: (id: RegionId | null) => void;
  preset: CameraPreset;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<THREE.Scene>(null);
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<OrbitControls>(null);
  const group = useRef<THREE.Group>(null);
  const renderer = useRef<THREE.WebGLRenderer>(null);

  // Scene, lights, controls — created once.
  useEffect(() => {
    const el = host.current!;
    const s = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(el.clientWidth, el.clientHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    el.appendChild(r.domElement);

    s.add(new THREE.HemisphereLight(0x9fb6ff, 0x0a0c12, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2.5, 3.5, 3);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x7fe8d8, 1.1);
    rim.position.set(-3, 1.5, -2.5);
    s.add(rim);
    const fill = new THREE.DirectionalLight(0x93b0ff, 0.5);
    fill.position.set(0, -2, 2);
    s.add(fill);

    const g = new THREE.Group();
    s.add(g);

    const c = new OrbitControls(cam, r.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 1;
    c.maxDistance = 8;

    scene.current = s;
    camera.current = cam;
    controls.current = c;
    group.current = g;
    renderer.current = r;

    let raf = 0;
    const tick = () => {
      c.update();
      r.render(s, cam);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const resize = () => {
      if (!el.clientWidth) return;
      cam.aspect = el.clientWidth / el.clientHeight;
      cam.updateProjectionMatrix();
      r.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      c.dispose();
      r.dispose();
      el.removeChild(r.domElement);
    };
  }, []);

  // Meshes, rebuilt whenever the measurements change.
  useEffect(() => {
    const g = group.current;
    if (!g) return;

    for (const child of [...g.children]) {
      g.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material)?.dispose();
    }

    for (const segment of model.segments) {
      const shell = new THREE.Mesh(
        latheFor(segment.outer, segment.length),
        new THREE.MeshStandardMaterial({
          color: COLORS.neutral,
          roughness: 0.62,
          metalness: 0.06,
          transparent: true,
          opacity: segment.measured ? 1 : 0.16,
          side: THREE.DoubleSide,
          depthWrite: segment.measured,
        }),
      );
      shell.position.set(...segment.origin);
      if (segment.scaleZ) shell.scale.z = segment.scaleZ;
      shell.userData = { regionId: segment.id, role: 'shell' };
      g.add(shell);

      if (!segment.measured) {
        const wire = new THREE.Mesh(
          latheFor(segment.outer, segment.length),
          new THREE.MeshBasicMaterial({
            color: COLORS.unmeasured,
            wireframe: true,
            transparent: true,
            opacity: 0.22,
          }),
        );
        wire.position.set(...segment.origin);
        if (segment.scaleZ) wire.scale.z = segment.scaleZ;
        wire.userData = { regionId: segment.id, role: 'wire' };
        g.add(wire);
        continue;
      }

      const core = new THREE.Mesh(
        latheFor(segment.muscle, segment.length),
        new THREE.MeshStandardMaterial({
          color: COLORS.muscle,
          roughness: 0.45,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        }),
      );
      core.position.set(...segment.origin);
      core.userData = { regionId: segment.id, role: 'core' };
      g.add(core);

      if (segment.visceral) {
        const visceral = new THREE.Mesh(
          latheFor(segment.visceral, segment.length),
          new THREE.MeshStandardMaterial({
            color: COLORS.fat,
            roughness: 0.4,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
          }),
        );
        visceral.position.set(...segment.origin);
        visceral.userData = { regionId: segment.id, role: 'visceral' };
        g.add(visceral);
      }
    }

    const cam = camera.current!;
    const c = controls.current!;
    const d = fitDistance(model.heightM);
    c.target.set(0, model.heightM * 0.5, 0);
    cam.position.set(0, model.heightM * 0.5, d);
    c.update();
  }, [model]);

  // Materials react to layer and selection without rebuilding geometry.
  useEffect(() => {
    const g = group.current;
    if (!g) return;

    for (const child of g.children) {
      const mesh = child as THREE.Mesh;
      const { regionId, role } = mesh.userData as { regionId: RegionId; role: string };
      const segment = model.segments.find((s) => s.id === regionId)!;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const dimmed = selected !== null && selected !== regionId;

      if (role === 'shell') {
        material.color.setHex(colorFor(segment, layer, model));
        if (!segment.measured) {
          material.opacity = dimmed ? 0.07 : 0.16;
        } else if (layer === 'muscle') {
          material.opacity = dimmed ? 0.12 : 0.28;
        } else {
          material.opacity = dimmed ? 0.3 : 1;
        }
        material.emissive?.setHex(selected === regionId ? 0x16342f : 0x000000);
      }

      if (role === 'core') {
        material.opacity = layer === 'muscle' ? (dimmed ? 0.35 : 1) : 0;
      }

      if (role === 'visceral') {
        material.opacity = layer === 'fat' ? (dimmed ? 0.3 : 0.95) : 0;
      }

      if (role === 'wire') {
        material.opacity = dimmed ? 0.08 : 0.22;
      }
    }
  }, [layer, selected, model]);

  // Camera presets.
  useEffect(() => {
    const cam = camera.current;
    const c = controls.current;
    if (!cam || !c) return;

    const d = fitDistance(model.heightM);
    const y = model.heightM * 0.5;
    const positions: Record<CameraPreset, [number, number, number]> = {
      front: [0, y, d],
      back: [0, y, -d],
      left: [-d, y, 0],
      right: [d, y, 0],
    };
    cam.position.set(...positions[preset]);
    c.target.set(0, model.heightM * 0.5, 0);
    c.update();
  }, [preset, model.heightM]);

  function handleClick(event: React.MouseEvent) {
    const el = host.current!;
    const cam = camera.current!;
    const g = group.current!;
    const rect = el.getBoundingClientRect();

    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, cam);

    const hit = raycaster
      .intersectObjects(g.children, false)
      .find((i) => (i.object.userData as { role: string }).role !== 'wire');

    onSelect(hit ? ((hit.object.userData as { regionId: RegionId }).regionId ?? null) : null);
  }

  return <div ref={host} onClick={handleClick} className="h-full w-full cursor-pointer" />;
}
