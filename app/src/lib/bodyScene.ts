/**
 * What colour each region wears in each layer, and how a pointer finds a region.
 * Pure Three.js maths, no renderer or DOM, so the rules that decide what is visible
 * can be asserted in a unit test rather than discovered in a screenshot.
 */
import * as THREE from 'three';
import type { BodyModel, RegionId, Segment } from './bodyModel';
import type { HumanMesh } from './humanMesh';

export type Layer = 'normal' | 'fat' | 'muscle' | 'balance';

/**
 * Layer hues are a categorical set, validated against the dark surface for lightness
 * band, chroma, colour-vision separation and contrast. Balance is a diverging pair
 * through a neutral midpoint. Do not substitute by eye.
 */
export const COLORS = {
  neutral: 0x8f9bb3,
  fat: 0xc2873f,
  muscle: 0x22a191,
  balanceHigh: 0x4a90d9,
  balanceLow: 0xd98244,
  balanceMid: 0x7c8598,
  unmeasured: 0x59617a,
  accent: 0x5eead4,
  dim: 0x0b0d12,
};

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function colorFor(segment: Segment, layer: Layer, model: BodyModel): number {
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

/** A tint and how much of it shows over the skin: 0 is skin, 1 is the tint alone. */
export interface OverlayEntry {
  color: THREE.Color;
  alpha: number;
}

export type Overlay = Partial<Record<RegionId, OverlayEntry>>;

const TINT_ALPHA = 0.9;
const UNMEASURED_ALPHA = 0.55;
const HOVER_ALPHA = 0.22;
const SELECT_ALPHA = 0.38;
const DIM_ALPHA = 0.3;

/**
 * The overlay for every region of the model. In the body layer the skin shows through
 * and only hover, selection and the dimming of everything else are drawn. In a data
 * layer each measured region carries its own colour strongly enough to read on any
 * skin tone; hover and selection lighten it.
 */
export function regionOverlay(
  model: BodyModel,
  layer: Layer,
  selected: RegionId | null,
  hovered: RegionId | null,
): Overlay {
  const out: Overlay = {};
  for (const s of model.segments) {
    const isSelected = s.id === selected;
    const isHovered = s.id === hovered;
    if (layer === 'normal') {
      if (isSelected) out[s.id] = { color: new THREE.Color(COLORS.accent), alpha: SELECT_ALPHA };
      else if (isHovered) out[s.id] = { color: new THREE.Color(COLORS.accent), alpha: HOVER_ALPHA };
      else if (selected) out[s.id] = { color: new THREE.Color(COLORS.dim), alpha: DIM_ALPHA };
      else out[s.id] = { color: new THREE.Color(COLORS.dim), alpha: 0 };
      continue;
    }
    const color = new THREE.Color(colorFor(s, layer, model));
    let alpha = s.measured ? TINT_ALPHA : UNMEASURED_ALPHA;
    if (isSelected) {
      color.lerp(new THREE.Color(0xffffff), 0.35);
      alpha = 0.95;
    } else if (isHovered) {
      color.lerp(new THREE.Color(0xffffff), 0.2);
      alpha = Math.min(1, alpha + 0.1);
    } else if (selected) {
      color.lerp(new THREE.Color(COLORS.dim), 0.35);
    }
    out[s.id] = { color, alpha };
  }
  return out;
}

/** Writes the overlay into the mesh's RGBA colour attribute; cloth vertices carry their region's tint too. */
export function writeOverlay(human: HumanMesh, overlay: Overlay): void {
  const attr = human.geometry.getAttribute('color') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const regions = human.asset.manifest.regions;
  const byIndex = regions.map((r) => overlay[r as RegionId] ?? null);
  const vr = human.asset.vertexRegion;
  for (let i = 0; i < vr.length; i++) {
    const e = byIndex[vr[i]];
    const o = i * 4;
    if (!e) { arr[o] = arr[o + 1] = arr[o + 2] = arr[o + 3] = 0; continue; }
    arr[o] = e.color.r; arr[o + 1] = e.color.g; arr[o + 2] = e.color.b; arr[o + 3] = e.alpha;
  }
  attr.needsUpdate = true;
}

/** The region under a ray, or null. Reads the face the ray hit, so cloth resolves to the region beneath it. */
export function pickRegion(human: HumanMesh, object: THREE.Object3D, raycaster: THREE.Raycaster): RegionId | null {
  const hits = raycaster.intersectObject(object, false);
  for (const h of hits) {
    if (h.faceIndex === undefined || h.faceIndex === null) continue;
    return human.regionOfFace(h.faceIndex);
  }
  return null;
}
