import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BodyModel, RegionId, Segment } from '../lib/bodyModel';
import { applyHover, applyLayer, buildSegmentMeshes, pickRegion, type Layer } from '../lib/bodyScene';

export type { Layer } from '../lib/bodyScene';
export type CameraPreset = 'front' | 'back' | 'left' | 'right';
/** `fit` frames every body the same size; `true` frames a fixed envelope so height shows. */
export type ScaleMode = 'fit' | 'true';

const FOV = 32;

/** The fixed frame true-scale mode uses, so two people of different heights differ on screen. */
export const ENVELOPE_M = 1.95;

/** Distance that fits a given height in frame with margin, from height and FOV. */
const fitDistance = (heightM: number) =>
  (heightM * 1.28) / (2 * Math.tan((FOV * Math.PI) / 360));

const RULE_X = -0.48;
const RULE_LABELS_M = [0.5, 1.0, 1.5];

/** A vertical rule in 10 cm ticks beside the figure, with the figure's own height marked. */
function heightRule(model: BodyModel): THREE.Group {
  const g = new THREE.Group();
  const pts: number[] = [];
  const push = (x1: number, y1: number, x2: number, y2: number) => pts.push(x1, y1, 0, x2, y2, 0);

  push(RULE_X, 0, RULE_X, ENVELOPE_M);
  for (let cm = 0; cm <= ENVELOPE_M * 100 + 0.5; cm += 10) {
    const y = cm / 100;
    const half = cm % 50 === 0 ? 0.03 : 0.015;
    push(RULE_X - half, y, RULE_X + half, y);
  }

  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color: 0x4a5266, transparent: true, opacity: 0.9 }),
  );
  g.add(lines);

  // The figure's own height, as a distinct marker reaching toward the body.
  const marker = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([RULE_X - 0.04, model.heightM, 0, RULE_X + 0.12, model.heightM, 0], 3),
    ),
    new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.9 }),
  );
  g.add(marker);
  g.visible = false;
  return g;
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
  return mesh;
}

export function BodyView({
  model,
  layer,
  selected,
  onSelect,
  preset,
  labelFor,
  focusRegion = null,
  scaleMode = 'fit',
}: {
  model: BodyModel;
  layer: Layer;
  selected: RegionId | null;
  onSelect: (id: RegionId | null) => void;
  preset: CameraPreset;
  labelFor: (segment: Segment) => string | null;
  /** A region brought into focus by keyboard, treated exactly like a pointer hover. */
  focusRegion?: RegionId | null;
  scaleMode?: ScaleMode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<OrbitControls>(null);
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
  const hovered = useRef<RegionId | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const rule = useRef<THREE.Group>(null);
  const ruleLabels = useRef<(HTMLDivElement | null)[]>([]);
  const heightLabel = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<ScaleMode>(scaleMode);
  scaleRef.current = scaleMode;
  const labelFn = useRef(labelFor);
  labelFn.current = labelFor;

  // Kept at a constant that clips nothing until the cutaway turns on, so switching
  // layers never recompiles a shader.
  const clip = useRef(new THREE.Plane(new THREE.Vector3(0, 0, -1), 10));

  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    // preserveDrawingBuffer lets a test read pixels back through a 2D canvas.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });

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

      const showRule = scaleRef.current === 'true';
      const placeLabel = (node: HTMLDivElement | null, y: number, alignRight: boolean) => {
        if (!node) return;
        if (!showRule) {
          node.style.opacity = '0';
          return;
        }
        projected.set(RULE_X + (alignRight ? 0.14 : -0.05), y, 0).project(cam);
        node.style.transform = `translate(${alignRight ? '0' : '-100%'}, -50%) translate(${
          ((projected.x + 1) / 2) * el.clientWidth
        }px, ${((-projected.y + 1) / 2) * el.clientHeight}px)`;
        node.style.opacity = projected.z < 1 ? '1' : '0';
      };
      RULE_LABELS_M.forEach((y, i) => placeLabel(ruleLabels.current[i], y, false));
      placeLabel(heightLabel.current, model.heightM, true);

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
    meshes.current = buildSegmentMeshes(model, clip.current);
    for (const m of meshes.current) g.add(m);

    rule.current = heightRule(model);
    rule.current.visible = scaleRef.current === 'true';
    g.add(rule.current);
    if (heightLabel.current) heightLabel.current.textContent = `${(model.heightM * 100).toFixed(1)} cm`;
  }, [model]);

  // Fit mode frames this body; true scale frames a fixed envelope so height is legible.
  useEffect(() => {
    if (rule.current) rule.current.visible = scaleMode === 'true';
    const cam = camera.current;
    const c = controls.current;
    if (!cam || !c) return;

    const frame = scaleMode === 'true' ? ENVELOPE_M : model.heightM;
    const d = fitDistance(frame);
    const y = frame * 0.5;
    const positions: Record<CameraPreset, [number, number, number]> = {
      front: [0, y, d],
      back: [0, y, -d],
      left: [-d, y, 0],
      right: [d, y, 0],
    };
    cam.position.set(...positions[preset]);
    c.target.set(0, y, 0);
    c.update();
  }, [preset, scaleMode, model]);

  useEffect(() => {
    applyLayer(meshes.current, layer, selected, model, clip.current);
    applyHover(meshes.current, hovered.current, selected, layer);
  }, [layer, selected, model]);

  // Keyboard focus drives hover only while it is in play; a selection or layer change
  // must not clear a hover the pointer is still resting on.
  const prevFocus = useRef<RegionId | null>(null);
  useEffect(() => {
    if (focusRegion !== null || prevFocus.current !== null) {
      hovered.current = focusRegion;
      applyHover(meshes.current, focusRegion, selected, layer);
    }
    prevFocus.current = focusRegion;
    // selected and layer are re-applied by the layer effect; only focus changes matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRegion]);

  function setHovered(next: RegionId | null) {
    if (next === hovered.current) return;
    hovered.current = next;
    applyHover(meshes.current, next, selected, layer);
    if (host.current) host.current.style.cursor = next ? 'pointer' : 'default';
  }

  function pick(event: React.MouseEvent): RegionId | null {
    const el = host.current!;
    const cam = camera.current!;
    const rect = el.getBoundingClientRect();

    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, cam);
    return pickRegion(meshes.current, raycaster);
  }

  return (
    <div
      ref={host}
      onPointerDown={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        // An orbit drag ends with a click event too; it must not read as a selection.
        const d = downAt.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
        onSelect(pick(e));
      }}
      onPointerMove={(e) => setHovered(pick(e))}
      onPointerLeave={() => setHovered(null)}
      className="relative h-full w-full"
    >
      {RULE_LABELS_M.map((y, i) => (
        <div
          key={y}
          ref={(el) => {
            ruleLabels.current[i] = el;
          }}
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap text-[10px] tabular-nums text-atlas-muted/70 opacity-0"
        >
          {y * 100} cm
        </div>
      ))}
      <div
        ref={heightLabel}
        data-testid="height-marker"
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded border border-atlas-accent/30 bg-atlas-bg/80 px-1.5 py-0.5 text-[11px] tabular-nums text-atlas-accent opacity-0"
      />
      <div
        ref={label}
        role="status"
        aria-live="polite"
        data-testid="hover-label"
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-lg border border-atlas-line bg-atlas-bg/90 px-2.5 py-1.5 text-xs text-atlas-text opacity-0 backdrop-blur transition-opacity"
      />
    </div>
  );
}
