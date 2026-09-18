import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BodyModel, RegionId, Segment } from '../lib/bodyModel';
import { pickRegion, regionOverlay, writeOverlay, type Layer } from '../lib/bodyScene';
import { bodyMaterials, syncBodyMaterials, DEFAULT_SKIN_TONE } from '../lib/bodyMaterials';
import type { HumanMesh } from '../lib/humanMesh';
import type { FitResult } from '../lib/bodyFit';

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
function heightRule(heightM: number): THREE.Group {
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
      new THREE.Float32BufferAttribute([RULE_X - 0.04, heightM, 0, RULE_X + 0.12, heightM, 0], 3),
    ),
    new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.9 }),
  );
  g.add(marker);
  g.visible = false;
  return g;
}

/** A soft ellipse of shadow, so the figure stands rather than floats. */
function contactShadow(heightM: number): THREE.Mesh {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.6)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(heightM * 0.5, heightM * 0.3),
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
  human,
  fit,
  skinTone = DEFAULT_SKIN_TONE,
  layer,
  selected,
  onSelect,
  preset,
  labelFor,
  focusRegion = null,
  scaleMode = 'fit',
}: {
  model: BodyModel;
  /** The realistic mesh, once its asset has loaded. */
  human: HumanMesh | null;
  /** Morph weights for this model, once computed. */
  fit: FitResult | null;
  skinTone?: string;
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
  const renderer = useRef<THREE.WebGLRenderer>(null);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh | null>(null);
  const centroids = useRef<Map<RegionId, THREE.Vector3>>(new Map());
  const hovered = useRef<RegionId | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const rule = useRef<THREE.Group>(null);
  const ruleLabels = useRef<(HTMLDivElement | null)[]>([]);
  const heightLabel = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<ScaleMode>(scaleMode);
  scaleRef.current = scaleMode;
  const labelFn = useRef(labelFor);
  labelFn.current = labelFor;
  const pendingPointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
    // preserveDrawingBuffer lets a test read pixels back through a 2D canvas.
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });

    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(el.clientWidth, el.clientHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    el.appendChild(r.domElement);

    // Image-based light does most of the work on skin; one key light gives it form.
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2.5, 3.5, 3);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.3));

    const g = new THREE.Group();
    scene.add(g);

    const c = new OrbitControls(cam, r.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 0.4;
    c.maxDistance = 8;

    camera.current = cam;
    controls.current = c;
    renderer.current = r;
    group.current = g;

    const projected = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    let raf = 0;
    const tick = () => {
      c.update();

      // Picking happens at most once per frame, from wherever the pointer last was.
      const p = pendingPointer.current;
      if (p && body.current && human) {
        pendingPointer.current = null;
        const rect = el.getBoundingClientRect();
        raycaster.setFromCamera(
          new THREE.Vector2(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1),
          cam,
        );
        applyHover(pickRegion(human, body.current, raycaster));
      }

      r.render(scene, cam);

      // The hover label tracks the body imperatively; doing it through React state
      // would re-render the tree every frame.
      const el2 = label.current;
      if (el2) {
        const id = hovered.current;
        const segment = id ? model.segments.find((s) => s.id === id) : null;
        const text = segment ? labelFn.current(segment) : null;
        const anchor = id ? centroids.current.get(id) : undefined;

        if (segment && text && anchor) {
          projected.copy(anchor).project(cam);
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
      r.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      c.dispose();
      scene.environment?.dispose();
      r.dispose();
      el.removeChild(r.domElement);
    };
    // The scene is rebuilt only when the mesh instance changes; everything else updates in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [human]);

  // The body: one mesh, four material groups, shaped by the fit and scaled to the height.
  useEffect(() => {
    const g = group.current;
    if (!g) return;

    for (const child of [...g.children]) {
      g.remove(child);
      const mesh = child as THREE.Mesh;
      if (mesh !== body.current) {
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material)?.dispose?.();
      }
    }
    body.current = null;

    g.add(contactShadow(model.heightM));
    rule.current = heightRule(model.heightM);
    rule.current.visible = scaleRef.current === 'true';
    g.add(rule.current);
    if (heightLabel.current) heightLabel.current.textContent = `${(model.heightM * 100).toFixed(1)} cm`;

    if (!human || !fit) return;
    human.setShape(fit.weights, model.heightM);
    const materials = bodyMaterials(skinTone);
    materials[2].visible = fit.params.gender < 0.5;
    syncBodyMaterials(materials, human);
    const mesh = new THREE.Mesh(human.geometry, materials);
    mesh.frustumCulled = false;
    g.add(mesh);
    body.current = mesh;

    centroids.current = new Map(model.segments.map((s) => [s.id, human.regionCentroid(s.id)]));
    writeOverlay(human, regionOverlay(model, layer, selected, hovered.current));
    // layer/selected are applied by their own effect; this one owns the geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, human, fit, skinTone]);

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
  }, [preset, scaleMode, model, human]);

  useEffect(() => {
    if (human && body.current) writeOverlay(human, regionOverlay(model, layer, selected, hovered.current));
  }, [layer, selected, model, human, fit]);

  // Keyboard focus drives hover only while it is in play; a selection or layer change
  // must not clear a hover the pointer is still resting on.
  const prevFocus = useRef<RegionId | null>(null);
  useEffect(() => {
    if (focusRegion !== null || prevFocus.current !== null) applyHover(focusRegion);
    prevFocus.current = focusRegion;
    // selected and layer are re-applied by the overlay effect; only focus changes matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRegion]);

  function applyHover(next: RegionId | null) {
    if (next === hovered.current) return;
    hovered.current = next;
    if (human && body.current) writeOverlay(human, regionOverlay(model, layer, selected, next));
    if (host.current) host.current.style.cursor = next ? 'pointer' : 'default';
  }

  function pickAt(clientX: number, clientY: number): RegionId | null {
    const el = host.current;
    const cam = camera.current;
    if (!el || !cam || !human || !body.current) return null;
    const rect = el.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1),
      cam,
    );
    return pickRegion(human, body.current, raycaster);
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
        onSelect(pickAt(e.clientX, e.clientY));
      }}
      onPointerMove={(e) => {
        pendingPointer.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerLeave={() => {
        pendingPointer.current = null;
        applyHover(null);
      }}
      className="relative h-full w-full"
    >
      {!human && (
        <div
          data-testid="body-loading"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-atlas-muted"
        >
          Loading body…
        </div>
      )}
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
