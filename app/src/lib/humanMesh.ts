/**
 * The realistic body: MakeHuman's CC0 base mesh plus a bank of morph targets,
 * blended on the CPU into one BufferGeometry. Blending happens once per fit, never
 * per frame. Measurements (region volumes, circumferences) come from the very same
 * blended positions the screen shows, so what the fit reports is what is drawn.
 */
import * as THREE from 'three';
import type { RegionId } from './bodyModel';
import {
  REGIONS,
  blendInto,
  circumference,
  regionVolumes,
  type Loop,
  type Slice,
  type SparseTarget,
} from './meshMath';

interface View {
  offset: number;
  length: number;
  dtype: 'int16' | 'uint16' | 'uint8';
  scale?: number;
}

export interface Manifest {
  version: number;
  source: { project: string; sha: string; license: string; url: string };
  units: 'dm';
  vertexCount: number;
  faceCount: number;
  skinVertexCount: number;
  views: Record<string, View>;
  groups: { name: 'skin' | 'brief' | 'top' | 'eyes'; start: number; count: number }[];
  regions: readonly string[];
  loops: { region: number; offset: number; count: number; open: boolean }[];
  targets: { name: string; offset: number; count: number; scale: number }[];
  eyes: { left: { center: number[]; radius: number }; right: { center: number[]; radius: number }; forward: number[] };
  landmarks: Record<string, [number, number, number]>;
  slices: Slice[];
  cloth: { brief: [number, number]; top: [number, number]; topX: number };
  template: { heightDm: number; minY: number; maxY: number };
  volumeModel: { base: Record<string, number>; perTarget: { name: string; dV: Record<string, number> }[] };
  circumferenceModel: { base: Record<string, number>; perTarget: { name: string; dC: Record<string, number> }[] };
  /** Fallback when the binary cannot be served on its own: base64 of body.bin. */
  data?: string;
}

export interface HumanAsset {
  manifest: Manifest;
  /** Template positions, decimetres. */
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  faceRegion: Uint8Array;
  vertexRegion: Uint8Array;
  loops: Loop[];
  targets: Map<string, SparseTarget>;
}

export type TargetWeights = Record<string, number>;

function view(bin: ArrayBuffer, v: View): Int16Array | Uint16Array | Uint8Array {
  switch (v.dtype) {
    case 'int16': return new Int16Array(bin, v.offset, v.length);
    case 'uint16': return new Uint16Array(bin, v.offset, v.length);
    case 'uint8': return new Uint8Array(bin, v.offset, v.length);
  }
}

export function parseHumanAsset(manifest: Manifest, bin: ArrayBuffer): HumanAsset {
  if (manifest.version !== 1) throw new Error(`unsupported body asset version ${manifest.version}`);
  const V = manifest.views;
  const q = view(bin, V.positions) as Int16Array;
  const positions = Float32Array.from(q, (x) => x * V.positions.scale!);
  const uvs = Float32Array.from(view(bin, V.uvs) as Uint16Array, (x) => x * V.uvs.scale!);
  const indices = Uint16Array.from(view(bin, V.indices) as Uint16Array);
  const faceRegion = Uint8Array.from(view(bin, V.faceRegion) as Uint8Array);
  const vertexRegion = Uint8Array.from(view(bin, V.vertexRegion) as Uint8Array);
  const loopVerts = view(bin, V.loops) as Uint16Array;
  const loops: Loop[] = manifest.loops.map((l) => ({
    region: l.region,
    vertices: Array.from(loopVerts.subarray(l.offset, l.offset + l.count)),
    open: l.open,
  }));
  const tIdx = view(bin, V.targetIndices) as Uint16Array;
  const tOff = view(bin, V.targetOffsets) as Int16Array;
  const targets = new Map<string, SparseTarget>();
  for (const t of manifest.targets) {
    targets.set(t.name, {
      indices: Uint16Array.from(tIdx.subarray(t.offset, t.offset + t.count)),
      offsets: Int16Array.from(tOff.subarray(t.offset * 3, (t.offset + t.count) * 3)),
      scale: t.scale,
    });
  }
  return { manifest, positions, uvs, indices, faceRegion, vertexRegion, loops, targets };
}

function fromBase64(s: string): ArrayBuffer {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Loads body.json (+ body.bin unless inlined) relative to `baseUrl`. */
export async function loadHumanAsset(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<HumanAsset> {
  const manifest = (await (await fetchImpl(`${baseUrl}body.json`)).json()) as Manifest;
  const bin = manifest.data
    ? fromBase64(manifest.data)
    : await (await fetchImpl(`${baseUrl}body.bin`)).arrayBuffer();
  return parseHumanAsset(manifest, bin);
}

export interface MeasureWhat {
  /** Default true. */
  volumes?: boolean;
  /** Slice ids to measure; default all. Pass [] for none. */
  slices?: string[];
}

export interface Measurement {
  /** Litres, at the height the body is scaled to. */
  volumesL: Record<string, number>;
  /** Metres. */
  circumferencesM: Record<string, number>;
  /** Template-dm → metre factor at this height. */
  scale: number;
}

export class HumanMesh {
  readonly geometry: THREE.BufferGeometry;
  readonly asset: HumanAsset;
  /** Blended positions, template decimetres. */
  private dm: Float32Array;
  private scratch: Float32Array;
  /** dm → m at the current height. */
  scale = 0.1;
  private minY = 0;
  readonly skin: { start: number; count: number };
  private regionIndex: Map<string, number>;

  constructor(asset: HumanAsset) {
    this.asset = asset;
    this.dm = Float32Array.from(asset.positions);
    this.scratch = new Float32Array(asset.positions.length);
    this.regionIndex = new Map(asset.manifest.regions.map((r, i) => [r, i]));
    const skin = asset.manifest.groups.find((g) => g.name === 'skin')!;
    this.skin = { start: skin.start, count: skin.count };

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(asset.positions.length), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(asset.uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((asset.positions.length / 3) * 4), 4));
    g.setIndex(new THREE.BufferAttribute(asset.indices, 1));
    asset.manifest.groups.forEach((grp, i) => g.addGroup(grp.start * 3, grp.count * 3, i));
    this.geometry = g;
    this.setShape({}, asset.manifest.template.heightDm * 0.1);
  }

  private blend(weights: TargetWeights, into: Float32Array) {
    const list: { target: SparseTarget; weight: number }[] = [];
    for (const [name, w] of Object.entries(weights)) {
      const t = this.asset.targets.get(name);
      if (t) list.push({ target: t, weight: w });
    }
    blendInto(this.asset.positions, into, list);
  }

  private extent(p: Float32Array): { minY: number; maxY: number } {
    let minY = Infinity, maxY = -Infinity;
    const n = this.asset.manifest.skinVertexCount;
    for (let i = 0; i < n; i++) {
      const y = p[i * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minY, maxY };
  }

  private measureFrom(p: Float32Array, heightM: number, what: MeasureWhat = {}): Measurement {
    const { minY, maxY } = this.extent(p);
    const scale = heightM / ((maxY - minY) * 0.1);
    const m = this.asset.manifest;
    const volumesL: Record<string, number> = {};
    if (what.volumes !== false) {
      const vol = regionVolumes(p, this.asset.indices, this.skin.start, this.skin.count, this.asset.faceRegion, this.asset.loops, m.regions.length);
      // A cubic decimetre is a litre, and positions are dm × 0.1 × scale in metres, so
      // litres drawn = dm³ × scale³.
      const k = scale ** 3;
      let total = 0;
      m.regions.forEach((r, i) => { volumesL[r] = vol[i] * k; total += vol[i] * k; });
      volumesL.total = total;
    }
    const circumferencesM: Record<string, number> = {};
    const wanted = what.slices === undefined ? m.slices : m.slices.filter((s) => what.slices!.includes(s.id));
    for (const s of wanted) {
      circumferencesM[s.id] = circumference(p, this.asset.indices, this.skin.start, this.skin.count, s) * 0.1 * scale;
    }
    return { volumesL, circumferencesM, scale };
  }

  /** Measure a candidate shape without touching the drawn geometry. Ask only for what you need: slices are the slow part. */
  measure(weights: TargetWeights, heightM: number, what: MeasureWhat = {}): Measurement {
    this.blend(weights, this.scratch);
    return this.measureFrom(this.scratch, heightM, what);
  }

  /** Blend, scale so the feet sit on y=0 and the crown reaches heightM, recompute normals. */
  setShape(weights: TargetWeights, heightM: number): Measurement {
    this.blend(weights, this.dm);
    const { minY, maxY } = this.extent(this.dm);
    this.scale = heightM / ((maxY - minY) * 0.1);
    this.minY = minY;
    const k = 0.1 * this.scale;
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.dm.length; i += 3) {
      arr[i] = this.dm[i] * k;
      arr[i + 1] = (this.dm[i + 1] - minY) * k;
      arr[i + 2] = this.dm[i + 2] * k;
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
    return this.measureFrom(this.dm, heightM);
  }

  /** Centres of the two eyeballs as drawn (metres), from the blended eye vertices. */
  eyeCentres(): { left: THREE.Vector3; right: THREE.Vector3 } {
    const g = this.asset.manifest.groups.find((x) => x.name === 'eyes');
    const pos = (this.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const acc = { left: [0, 0, 0, 0], right: [0, 0, 0, 0] };
    const seen = new Set<number>();
    if (g) {
      for (let f = g.start; f < g.start + g.count; f++) {
        for (let k = 0; k < 3; k++) {
          const i = this.asset.indices[f * 3 + k];
          if (seen.has(i)) continue;
          seen.add(i);
          const t = pos[i * 3] > 0 ? acc.left : acc.right;
          t[0] += pos[i * 3]; t[1] += pos[i * 3 + 1]; t[2] += pos[i * 3 + 2]; t[3]++;
        }
      }
    }
    const v = (t: number[]) => (t[3] ? new THREE.Vector3(t[0] / t[3], t[1] / t[3], t[2] / t[3]) : new THREE.Vector3());
    return { left: v(acc.left), right: v(acc.right) };
  }

  /** Template-dm point → drawn metres. */
  toMetres(p: ArrayLike<number>): THREE.Vector3 {
    const k = 0.1 * this.scale;
    return new THREE.Vector3(p[0] * k, (p[1] - this.minY) * k, p[2] * k);
  }

  regionOfFace(faceIndex: number): RegionId {
    return this.asset.manifest.regions[this.asset.faceRegion[faceIndex]] as RegionId;
  }

  regionCentroid(region: RegionId): THREE.Vector3 {
    const r = this.regionIndex.get(region) ?? -1;
    const n = this.asset.manifest.skinVertexCount;
    let sx = 0, sy = 0, sz = 0, c = 0;
    for (let i = 0; i < n; i++) {
      if (this.asset.vertexRegion[i] !== r) continue;
      sx += this.dm[i * 3]; sy += this.dm[i * 3 + 1]; sz += this.dm[i * 3 + 2]; c++;
    }
    return c ? this.toMetres([sx / c, sy / c, sz / c]) : new THREE.Vector3();
  }

  /** Compact vertex ids of a region (all groups, so cloth carries the region tint too). */
  vertexIndicesOf(region: RegionId): number[] {
    const r = this.regionIndex.get(region) ?? -1;
    const out: number[] = [];
    for (let i = 0; i < this.asset.vertexRegion.length; i++) if (this.asset.vertexRegion[i] === r) out.push(i);
    return out;
  }

  get heightM(): number {
    const { minY, maxY } = this.extent(this.dm);
    return (maxY - minY) * 0.1 * this.scale;
  }

  get regions(): readonly RegionId[] {
    return REGIONS as unknown as readonly RegionId[];
  }
}
