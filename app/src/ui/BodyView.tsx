import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BodyModel, RegionId, Segment } from '../lib/bodyModel';

export type Layer = 'normal' | 'fat' | 'muscle' | 'balance' | 'inside';
export type CameraPreset = 'front' | 'back' | 'left' | 'right';

const FOV = 32;

/** Distance that fits the whole figure in frame with margin, from height and FOV. */
const fitDistance = (heightM: number) =>
  (heightM * 1.28) / (2 * Math.tan((FOV * Math.PI) / 360));

/**
 * Compartment hues are a categorical set, validated against the dark surface for
 * lightness band, chroma, colour-vision separation and contrast. Balance is a
 * diverging pair through a neutral midpoint. Do not substitute by eye.
 */
export const COLORS = {
  neutral: 0x8f9bb3,
  fat: 0xc2873f,
  muscle: 0x22a191,
  visceral: 0x8a72d8,
  balanceHigh: 0x4a90d9,
  balanceLow: 0xd98244,
  balanceMid: 0x7c8598,
  unmeasured: 0x59617a,
};

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

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

/**
 * The face revealed when a solid of revolution is cut through its own axis: the
 * silhouette, filled. Drawn flat so the nested compartments read as bands rather than
 * as shaded surfaces.
 */
function capFor(radii: number[], length: number): THREE.ShapeGeometry {
  const smooth = resample(radii);
  const n = smooth.length;
  const y = (i: number) => -(i / (n - 1)) * length;

  const shape = new THREE.Shape();
  shape.moveTo(smooth[0], 0);
  for (let i = 1; i < n; i++) shape.lineTo(smooth[i], y(i));
  for (let i = n - 1; i >= 0; i--) shape.lineTo(-smooth[i], y(i));
  shape.closePath();

  return new THREE.ShapeGeometry(shape);
}

/** A soft ellipse of shadow, so the figure stands rather than floats. */
function contactShadow(model: BodyModel): THREE.Mesh {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.25)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(model.heightM * 0.5, model.heightM * 0.3),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.userData = { role: 'shadow' };
  return mesh;
}

function colorFor(segment: Segment, layer: Layer, model: BodyModel): number {
  if (!segment.measured) return COLORS.unmeasured;
  if (layer === 'inside') return COLORS.fat;

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
    if (pair === 0) return COLORS.balanceMid;

    const heavier = pair > 0 ? 'left' : 'right';
    const isHeavier = segment.id.startsWith(heavier);
    const strength = Math.min(1, Math.abs(pair) * 12);
    return new THREE.Color(COLORS.balanceMid)
      .lerp(new THREE.Color(isHeavier ? COLORS.balanceHigh : COLORS.balanceLow), strength)
      .getHex();
  }

  return COLORS.neutral;
}

function place(mesh: THREE.Object3D, segment: Segment, flatten = false) {
  mesh.position.set(...segment.origin);
  mesh.scale.set(segment.scaleX ?? 1, 1, flatten ? 1 : (segment.scaleZ ?? 1));
  mesh.rotation.z = segment.rotationZ ?? 0;
}

export function BodyView({
  model,
  layer,
  selected,
  onSelect,
  preset,
  labelFor,
}: {
  model: BodyModel;
  layer: Layer;
  selected: RegionId | null;
  onSelect: (id: RegionId | null) => void;
  preset: CameraPreset;
  labelFor: (segment: Segment) => string | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<OrbitControls>(null);
  const group = useRef<THREE.Group>(null);
  const hovered = useRef<RegionId | null>(null);
  const labelFn = useRef(labelFor);
  labelFn.current = labelFor;

  // Kept at a constant that clips nothing until the cutaway turns on, so switching
  // layers never recompiles a shader.
  const clip = useRef(new THREE.Plane(new THREE.Vector3(0, 0, -1), 10));

  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x0a0c12, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2.5, 3.5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fe8d8, 0.8);
    rim.position.set(-3, 1.5, -2.5);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x93b0ff, 0.5);
    fill.position.set(0, -2, 2);
    scene.add(fill);

    const g = new THREE.Group();
    scene.add(g);

    const c = new OrbitControls(cam, renderer.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 1;
    c.maxDistance = 8;

    camera.current = cam;
    controls.current = c;
    group.current = g;

    const projected = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      c.update();
      renderer.render(scene, cam);

      // The hover label tracks the body imperatively; doing it through React state
      // would re-render the tree every frame.
      const el2 = label.current;
      if (el2) {
        const id = hovered.current;
        const segment = id ? model.segments.find((s) => s.id === id) : null;
        const text = segment ? labelFn.current(segment) : null;

        if (segment && text) {
          projected.set(
            segment.origin[0],
            segment.origin[1] - segment.length * 0.45,
            segment.origin[2],
          );
          projected.project(cam);
          el2.textContent = text;
          el2.style.transform = `translate(-50%, -50%) translate(${
            ((projected.x + 1) / 2) * el.clientWidth
          }px, ${((-projected.y + 1) / 2) * el.clientHeight}px)`;
          el2.style.opacity = projected.z < 1 ? '1' : '0';
        } else {
          el2.style.opacity = '0';
        }
      }

      raf = requestAnimationFrame(tick);
    };
    tick();

    const resize = () => {
      if (!el.clientWidth) return;
      cam.aspect = el.clientWidth / el.clientHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      c.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [model]);

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

    g.add(contactShadow(model));

    const clipping = [clip.current];

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
          clippingPlanes: clipping,
        }),
      );
      place(shell, segment);
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
            clippingPlanes: clipping,
          }),
        );
        place(wire, segment);
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
          clippingPlanes: clipping,
        }),
      );
      place(core, segment);
      core.userData = { regionId: segment.id, role: 'core' };
      g.add(core);

      if (segment.visceral) {
        const visceral = new THREE.Mesh(
          latheFor(segment.visceral, segment.length),
          new THREE.MeshStandardMaterial({
            color: COLORS.visceral,
            roughness: 0.4,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            clippingPlanes: clipping,
          }),
        );
        place(visceral, segment);
        visceral.userData = { regionId: segment.id, role: 'visceral' };
        g.add(visceral);
      }

      // Cut faces, nested front to back so the compartments read as bands. Flat-shaded
      // and unclipped, since they are the surface the clip reveals.
      const caps: [string, number[], number, number][] = [
        ['cap-fat', segment.outer, COLORS.fat, -0.0006],
        ['cap-muscle', segment.muscle, COLORS.muscle, -0.0004],
      ];
      if (segment.visceral) caps.push(['cap-visceral', segment.visceral, COLORS.visceral, -0.0002]);

      for (const [role, radii, color, z] of caps) {
        const cap = new THREE.Mesh(
          capFor(radii, segment.length),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
          }),
        );
        place(cap, segment, true);
        cap.position.z += z;
        cap.userData = { regionId: segment.id, role };
        g.add(cap);
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

    const inside = layer === 'inside';
    clip.current.constant = inside ? 0 : 10;

    for (const child of g.children) {
      const mesh = child as THREE.Mesh;
      const { regionId, role } = mesh.userData as { regionId: RegionId; role: string };
      if (role === 'shadow') continue;

      const segment = model.segments.find((s) => s.id === regionId)!;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const dimmed = selected !== null && selected !== regionId;

      if (role === 'shell') {
        material.color.setHex(colorFor(segment, layer, model));
        if (!segment.measured) {
          material.opacity = dimmed ? 0.07 : inside ? 0.1 : 0.16;
        } else if (layer === 'muscle') {
          material.opacity = dimmed ? 0.12 : 0.3;
        } else if (layer === 'fat') {
          // The visceral core sits inside this shell, so the shell has to let it through.
          material.opacity = dimmed ? 0.25 : segment.visceral ? 0.55 : 1;
        } else {
          material.opacity = dimmed ? 0.3 : 1;
        }
        material.emissive?.setHex(selected === regionId ? 0x16342f : 0x000000);
      }

      if (role === 'core') {
        material.opacity = layer === 'muscle' || inside ? (dimmed ? 0.35 : 1) : 0;
      }

      if (role === 'visceral') {
        material.opacity = layer === 'fat' || inside ? (dimmed ? 0.3 : 0.95) : 0;
      }

      if (role.startsWith('cap-')) {
        material.opacity = inside ? (dimmed ? 0.3 : 1) : 0;
      }

      if (role === 'wire') {
        material.opacity = dimmed ? 0.08 : 0.22;
      }
    }
  }, [layer, selected, model]);

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

  function pick(event: React.MouseEvent): RegionId | null {
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

    const hit = raycaster.intersectObjects(g.children, false).find((i) => {
      const role = (i.object.userData as { role?: string }).role;
      return role !== undefined && role !== 'wire' && role !== 'shadow';
    });

    return hit ? ((hit.object.userData as { regionId: RegionId }).regionId ?? null) : null;
  }

  return (
    <div
      ref={host}
      onClick={(e) => onSelect(pick(e))}
      onPointerMove={(e) => {
        hovered.current = pick(e);
        if (host.current) host.current.style.cursor = hovered.current ? 'pointer' : 'default';
      }}
      onPointerLeave={() => {
        hovered.current = null;
      }}
      className="relative h-full w-full"
    >
      <div
        ref={label}
        data-testid="hover-label"
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-lg border border-atlas-line bg-atlas-bg/90 px-2.5 py-1.5 text-xs text-atlas-text opacity-0 backdrop-blur transition-opacity"
      />
    </div>
  );
}
