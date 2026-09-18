/**
 * Builds and styles the body's meshes. Pure Three.js, no renderer or DOM, so the
 * material invariants that decide whether a compartment is actually visible can be
 * asserted in a unit test rather than discovered in a screenshot.
 */
import * as THREE from 'three';
import type { BodyModel, RegionId, Segment } from './bodyModel';

export type Layer = 'normal' | 'fat' | 'muscle' | 'balance' | 'inside';

export type Role = 'shell' | 'core' | 'visceral' | 'wire' | 'cap-fat' | 'cap-muscle' | 'cap-visceral';

export interface MeshTag {
  regionId: RegionId;
  role: Role;
}

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

/** The model's arrays are already the drawn profile; resampling again here would make the drawn volume diverge from the tested one. */
function latheFor(radii: number[], length: number): THREE.LatheGeometry {
  const points = radii.map(
    (r, i) => new THREE.Vector2(Math.max(r, 0.0005), -(i / (radii.length - 1)) * length),
  );
  return new THREE.LatheGeometry(points, 48);
}

/**
 * The face revealed when a solid of revolution is cut through its own axis: the
 * silhouette, filled. Drawn flat so nested compartments read as bands.
 */
function capFor(radii: number[], length: number): THREE.ShapeGeometry {
  const n = radii.length;
  const y = (i: number) => -(i / (n - 1)) * length;

  const shape = new THREE.Shape();
  shape.moveTo(radii[0], 0);
  for (let i = 1; i < n; i++) shape.lineTo(radii[i], y(i));
  for (let i = n - 1; i >= 0; i--) shape.lineTo(-radii[i], y(i));
  shape.closePath();

  return new THREE.ShapeGeometry(shape);
}

export function colorFor(segment: Segment, layer: Layer, model: BodyModel): number {
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

/** Draw order within a segment: inner compartments first, so the shell composites over them. */
const ROLE_ORDER: Record<Role, number> = {
  visceral: 0,
  core: 1,
  shell: 2,
  wire: 2,
  'cap-fat': 3,
  'cap-muscle': 4,
  'cap-visceral': 5,
};

export function buildSegmentMeshes(model: BodyModel, clip: THREE.Plane): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const clipping = [clip];

  const tag = (mesh: THREE.Mesh, segment: Segment, role: Role, index: number) => {
    mesh.userData = { regionId: segment.id, role } satisfies MeshTag;
    // Per segment, so an arm's shell never draws over the trunk's core at the join.
    mesh.renderOrder = index * 10 + ROLE_ORDER[role];
    meshes.push(mesh);
  };

  model.segments.forEach((segment, index) => {
    const shell = new THREE.Mesh(
      latheFor(segment.outer, segment.length),
      new THREE.MeshStandardMaterial({
        color: COLORS.neutral,
        roughness: 0.62,
        metalness: 0.06,
        transparent: true,
        opacity: 1,
        side: THREE.FrontSide,
        clippingPlanes: clipping,
      }),
    );
    place(shell, segment);
    tag(shell, segment, 'shell', index);

    if (!segment.measured) {
      const wire = new THREE.Mesh(
        latheFor(segment.outer, segment.length),
        new THREE.MeshBasicMaterial({
          color: COLORS.unmeasured,
          wireframe: true,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          clippingPlanes: clipping,
        }),
      );
      place(wire, segment);
      tag(wire, segment, 'wire', index);
      return;
    }

    const core = new THREE.Mesh(
      latheFor(segment.muscle, segment.length),
      new THREE.MeshStandardMaterial({
        color: COLORS.muscle,
        roughness: 0.45,
        side: THREE.FrontSide,
        clippingPlanes: clipping,
      }),
    );
    place(core, segment);
    tag(core, segment, 'core', index);

    if (segment.visceral) {
      const visceral = new THREE.Mesh(
        latheFor(segment.visceral, segment.length),
        new THREE.MeshStandardMaterial({
          color: COLORS.visceral,
          roughness: 0.4,
          side: THREE.FrontSide,
          clippingPlanes: clipping,
        }),
      );
      place(visceral, segment);
      tag(visceral, segment, 'visceral', index);
    }

    // Cut faces, nested front to back so the compartments read as bands. Flat-shaded
    // and unclipped, since they are the surface the clip reveals.
    const caps: [Role, number[], number, number][] = [
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
          opacity: 1,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      place(cap, segment, true);
      cap.position.z += z;
      tag(cap, segment, role, index);
    }
  });

  return meshes;
}

type Std = THREE.MeshStandardMaterial;

/**
 * Sets each mesh's visibility, opacity and depth behaviour for a layer.
 *
 * Invariants this enforces, and the test asserts:
 * - anything translucent never writes depth, so it cannot occlude what sits inside it;
 * - a compartment that is not part of the layer is `visible = false`, not opacity 0, so it
 *   neither writes depth nor catches a raycast;
 * - the compartment a layer exists to show is drawn opaque.
 */
export function applyLayer(
  meshes: THREE.Mesh[],
  layer: Layer,
  selected: RegionId | null,
  model: BodyModel,
  clip: THREE.Plane,
) {
  const inside = layer === 'inside';
  clip.constant = inside ? 0 : 10;

  const translucent = (m: Std, opacity: number) => {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = opacity >= 1;
  };
  const opaque = (m: Std) => {
    m.transparent = false;
    m.opacity = 1;
    m.depthWrite = true;
  };
  const sideFor = (m: Std, side: THREE.Side) => {
    if (m.side !== side) {
      m.side = side;
      m.needsUpdate = true;
    }
  };

  for (const mesh of meshes) {
    const { regionId, role } = mesh.userData as MeshTag;
    const segment = model.segments.find((s) => s.id === regionId)!;
    const material = mesh.material as Std;
    const isSelected = selected === regionId;
    const dimmed = selected !== null && !isSelected;

    if (role === 'shell') {
      mesh.visible = true;
      material.color.setHex(colorFor(segment, layer, model));
      material.emissive.setHex(isSelected ? 0x16342f : 0x000000);
      // The clip plane exposes interior back faces; only then does a translucent lathe
      // need both sides, and only then is the self-overlap worth it.
      sideFor(material, inside ? THREE.DoubleSide : THREE.FrontSide);

      if (!segment.measured) {
        translucent(material, isSelected ? 0.45 : dimmed ? 0.07 : inside ? 0.1 : 0.16);
      } else if (layer === 'muscle') {
        translucent(material, dimmed ? 0.12 : 0.3);
      } else if (layer === 'fat' && segment.visceral) {
        translucent(material, dimmed ? 0.25 : 0.55);
      } else if (dimmed) {
        translucent(material, 0.3);
      } else {
        translucent(material, 1);
      }
      continue;
    }

    if (role === 'core') {
      mesh.visible = layer === 'muscle' || inside;
      if (!mesh.visible) continue;
      if (dimmed) translucent(material, 0.35);
      else opaque(material);
      sideFor(material, inside ? THREE.DoubleSide : THREE.FrontSide);
      continue;
    }

    if (role === 'visceral') {
      mesh.visible = layer === 'fat' || inside;
      if (!mesh.visible) continue;
      if (dimmed) translucent(material, 0.3);
      else opaque(material);
      sideFor(material, inside ? THREE.DoubleSide : THREE.FrontSide);
      continue;
    }

    if (role.startsWith('cap-')) {
      mesh.visible = inside;
      if (!mesh.visible) continue;
      material.transparent = true;
      material.opacity = dimmed ? 0.3 : 1;
      material.depthWrite = false;
      continue;
    }

    if (role === 'wire') {
      mesh.visible = true;
      material.transparent = true;
      material.opacity = isSelected ? 0.6 : dimmed ? 0.08 : 0.22;
      material.depthWrite = false;
      material.color.setHex(isSelected ? COLORS.neutral : COLORS.unmeasured);
    }
  }
}

/** The region under a ray, ignoring anything hidden or decorative. Raycaster itself does not skip invisible meshes. */
export function pickRegion(meshes: THREE.Object3D[], raycaster: THREE.Raycaster): RegionId | null {
  const hit = raycaster.intersectObjects(meshes, false).find((i) => {
    if (!i.object.visible) return false;
    const role = (i.object.userData as Partial<MeshTag>).role;
    return role !== undefined && role !== 'wire';
  });
  return hit ? ((hit.object.userData as MeshTag).regionId ?? null) : null;
}
