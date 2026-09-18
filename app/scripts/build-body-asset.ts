/**
 * Builds public/body/body.{bin,json} from MakeHuman's CC0 base mesh and targets.
 *
 * Run with `npm run build:body`. Downloads are cached under node_modules/.cache so a
 * re-run is offline; the output is deterministic for the pinned commit. The outputs
 * are committed: the app never fetches from GitHub.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGIONS,
  blendInto,
  boundaryLoops,
  circumference,
  regionVolumes,
  sliceLoops,
  pickSlice,
  type Loop,
  type Slice,
  type SparseTarget,
} from '../src/lib/meshMath';

const SHA = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
const BASE = `https://raw.githubusercontent.com/makehumancommunity/makehuman/${SHA}/makehuman/data/`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules/.cache/makehuman');
const OUT = join(ROOT, 'public/body');

// Cloth bands on the tights helper, template decimetres. Tuned by looking at the render.
const CLOTH = { brief: [-0.9, 1.75] as [number, number], top: [2.75, 5.1] as [number, number], topX: 2.05 };

// ---------------------------------------------------------------------------
// Fetch with cache

async function fetchText(rel: string): Promise<string> {
  const local = join(CACHE, rel);
  if (existsSync(local)) return readFileSync(local, 'utf8');
  const res = await fetch(BASE + rel);
  if (!res.ok) throw new Error(`${res.status} ${rel}`);
  const text = await res.text();
  mkdirSync(dirname(local), { recursive: true });
  writeFileSync(local, text);
  return text;
}

// ---------------------------------------------------------------------------
// OBJ

interface Obj {
  verts: Float64Array; // source vertices, xyz
  uvs: Float64Array;
  vertUv: Int32Array; // first-seen uv index per source vertex, -1 if none
  groups: Map<string, number[][]>; // group -> quads (source vertex ids)
}

function parseObj(text: string): Obj {
  const v: number[] = [], vt: number[] = [];
  const groups = new Map<string, number[][]>();
  let g = 'default';
  const vertUvPairs: [number, number][] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/);
      v.push(+x, +y, +z);
    } else if (line.startsWith('vt ')) {
      const [, u, w] = line.split(/\s+/);
      vt.push(+u, +w);
    } else if (line.startsWith('g ')) {
      g = line.slice(2).trim();
    } else if (line.startsWith('f ')) {
      const face = line.slice(2).trim().split(/\s+/).map((tok) => {
        const [vi, ti] = tok.split('/');
        const vid = +vi - 1;
        if (ti) vertUvPairs.push([vid, +ti - 1]);
        return vid;
      });
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(face);
    }
  }
  const vertUv = new Int32Array(v.length / 3).fill(-1);
  for (const [vid, ti] of vertUvPairs) if (vertUv[vid] < 0) vertUv[vid] = ti;
  return { verts: Float64Array.from(v), uvs: Float64Array.from(vt), vertUv, groups };
}

// ---------------------------------------------------------------------------
// Regions from bone weights

const BONE_REGION: [RegExp, (typeof REGIONS)[number]][] = [
  [/^(head|jaw|eye\.|oculi|orbicularis|levator|oris|risorius|special04|tongue)/, 'head'],
  [/^neck0/, 'neck'],
  [/^(root|pelvis|spine0|clavicle|breast|special05)/, 'trunk'],
  [/^(shoulder01|upperarm|lowerarm|wrist).*\.L$/, 'left_arm'],
  [/^(shoulder01|upperarm|lowerarm|wrist).*\.R$/, 'right_arm'],
  [/^(metacarpal|finger)/, 'hands'],
  [/^(upperleg|lowerleg).*\.L$/, 'left_leg'],
  [/^(upperleg|lowerleg).*\.R$/, 'right_leg'],
  [/^(foot|toe)/, 'feet'],
];

function regionOfBone(bone: string): number {
  for (const [re, r] of BONE_REGION) if (re.test(bone)) return REGIONS.indexOf(r);
  throw new Error(`unmapped bone ${bone}`);
}

// ---------------------------------------------------------------------------
// Targets

function parseTarget(text: string): Map<number, [number, number, number]> {
  const m = new Map<number, [number, number, number]>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [i, x, y, z] = line.split(/\s+/);
    m.set(+i, [+x, +y, +z]);
  }
  return m;
}

function averageTargets(maps: Map<number, [number, number, number]>[]): Map<number, [number, number, number]> {
  const out = new Map<number, [number, number, number]>();
  for (const m of maps) {
    for (const [i, [x, y, z]] of m) {
      const cur = out.get(i) ?? [0, 0, 0];
      cur[0] += x / maps.length; cur[1] += y / maps.length; cur[2] += z / maps.length;
      out.set(i, cur);
    }
  }
  return out;
}

function quantise(map: Map<number, [number, number, number]>, compact: Int32Array): SparseTarget {
  const entries: [number, number, number, number][] = [];
  let max = 0;
  for (const [src, [x, y, z]] of map) {
    const c = compact[src];
    if (c < 0) continue;
    entries.push([c, x, y, z]);
    max = Math.max(max, Math.abs(x), Math.abs(y), Math.abs(z));
  }
  entries.sort((a, b) => a[0] - b[0]);
  const scale = max > 0 ? max / 32767 : 1;
  const indices = new Uint16Array(entries.length);
  const offsets = new Int16Array(entries.length * 3);
  entries.forEach(([c, x, y, z], k) => {
    indices[k] = c;
    offsets[k * 3] = Math.round(x / scale);
    offsets[k * 3 + 1] = Math.round(y / scale);
    offsets[k * 3 + 2] = Math.round(z / scale);
  });
  return { indices, offsets, scale };
}

const GENDERS = ['female', 'male'] as const;
const ETHNIC = ['african', 'asian', 'caucasian'];
const LIMBS = ['upperarm', 'lowerarm', 'upperleg', 'lowerleg'];
const TORSO = [
  'torso/torso-scale-horiz', 'torso/torso-scale-depth', 'torso/torso-vshape', 'torso/torso-muscle-pectoral',
  'stomach/stomach-tone', 'hip/hip-scale-horiz', 'buttocks/buttocks-volume',
];

/** name -> list of source files averaged into it. */
function targetPlan(): [string, string[]][] {
  const plan: [string, string[]][] = [];
  for (const g of GENDERS) {
    for (const age of ['young', 'old']) {
      plan.push([`macro-${g}-${age}`, ETHNIC.map((e) => `targets/macrodetails/${e}-${g}-${age}.target`)]);
    }
    for (const side of ['min', 'max']) {
      plan.push([`weight-${g}-${side}`, [`targets/macrodetails/universal-${g}-young-averagemuscle-${side}weight.target`]]);
      plan.push([`muscle-${g}-${side}`, [`targets/macrodetails/universal-${g}-young-${side}muscle-averageweight.target`]]);
    }
  }
  for (const s of ['l', 'r']) for (const limb of LIMBS) for (const kind of ['fat', 'muscle']) for (const dir of ['decr', 'incr']) {
    plan.push([`${s}-${limb}-${kind}-${dir}`, [`targets/armslegs/${s}-${limb}-${kind}-${dir}.target`]]);
  }
  for (const t of TORSO) for (const dir of ['decr', 'incr']) {
    plan.push([`${t.split('/')[1]}-${dir}`, [`${'targets/' + t}-${dir}.target`]]);
  }
  return plan;
}

// ---------------------------------------------------------------------------

async function main() {
  const obj = parseObj(await fetchText('3dobjs/base.obj'));
  const weights = JSON.parse(await fetchText('rigs/default_weights.mhw')).weights as Record<string, [number, number][]>;
  const sourceCount = obj.verts.length / 3;
  const y = (i: number) => obj.verts[i * 3 + 1];
  const x = (i: number) => obj.verts[i * 3];

  // ---- Kept faces, in group order: skin, brief, top, eyes.
  const body = obj.groups.get('body')!;
  const tights = obj.groups.get('helper-tights')!;
  // Quads are kept with a margin around the band; the cloth shader cuts the exact hem, so
  // the edge is a straight line and not a staircase of quads.
  const MARGIN = 0.35;
  const touches = (q: number[], [lo, hi]: [number, number]) => q.some((i) => y(i) >= lo - MARGIN && y(i) <= hi + MARGIN);
  const brief = tights.filter((q) => touches(q, CLOTH.brief));
  const top = tights.filter((q) => touches(q, CLOTH.top) && q.some((i) => Math.abs(x(i)) <= CLOTH.topX + MARGIN));
  const eyes = [...obj.groups.get('helper-l-eye')!, ...obj.groups.get('helper-r-eye')!];
  const groupsQuads: [string, number[][]][] = [['skin', body], ['brief', brief], ['top', top], ['eyes', eyes]];

  // ---- Compact vertex ids in first-use order.
  const compact = new Int32Array(sourceCount).fill(-1);
  const source: number[] = [];
  for (const [, quads] of groupsQuads) for (const q of quads) for (const i of q) {
    if (compact[i] < 0) { compact[i] = source.length; source.push(i); }
  }
  const N = source.length;
  if (N > 65535) throw new Error(`too many vertices for uint16: ${N}`);

  // ---- Region per source vertex from bone weights.
  const regionWeight = new Float64Array(sourceCount * REGIONS.length);
  for (const [bone, list] of Object.entries(weights)) {
    const r = regionOfBone(bone);
    for (const [vi, w] of list) regionWeight[vi * REGIONS.length + r] += w;
  }
  const vertexRegion = new Uint8Array(N);
  for (let c = 0; c < N; c++) {
    const s = source[c];
    let best = 0, bw = -1;
    for (let r = 0; r < REGIONS.length; r++) {
      const w = regionWeight[s * REGIONS.length + r];
      if (w > bw) { bw = w; best = r; }
    }
    vertexRegion[c] = best;
  }

  // Triangulate; face region = majority of the quad's vertices (ties -> lowest enum).
  const tris: number[] = [];
  const faceRegion: number[] = [];
  const groups: { name: string; start: number; count: number }[] = [];
  for (const [name, quads] of groupsQuads) {
    const start = tris.length / 3;
    for (const q of quads) {
      const c = q.map((i) => compact[i]);
      const counts = new Map<number, number>();
      for (const v of c) counts.set(vertexRegion[v], (counts.get(vertexRegion[v]) ?? 0) + 1);
      let r = 0, rc = -1;
      for (const [reg, n] of [...counts].sort((a, b) => a[0] - b[0])) if (n > rc) { rc = n; r = reg; }
      if (c.length === 4) {
        tris.push(c[0], c[1], c[2], c[0], c[2], c[3]);
        faceRegion.push(r, r);
      } else if (c.length === 3) {
        tris.push(c[0], c[1], c[2]);
        faceRegion.push(r);
      } else throw new Error(`face with ${c.length} vertices`);
    }
    groups.push({ name, start, count: tris.length / 3 - start });
  }
  const indices = Uint16Array.from(tris);
  const faceRegionArr = Uint8Array.from(faceRegion);
  const skin = groups[0];

  // ---- Speckle removal on skin vertices: one round of 1-ring majority.
  const adj = new Map<number, Set<number>>();
  for (let f = skin.start; f < skin.start + skin.count; f++) {
    const a = indices[f * 3], b = indices[f * 3 + 1], c = indices[f * 3 + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      (adj.get(p) ?? adj.set(p, new Set()).get(p)!).add(q);
      (adj.get(q) ?? adj.set(q, new Set()).get(q)!).add(p);
    }
  }
  let flipped = 0;
  const before = Uint8Array.from(vertexRegion);
  for (const [v, nb] of adj) {
    const counts = new Map<number, number>();
    for (const n of nb) counts.set(before[n], (counts.get(before[n]) ?? 0) + 1);
    let r = before[v], rc = 0;
    for (const [reg, n] of counts) if (n > rc) { rc = n; r = reg; }
    if (r !== before[v] && rc >= 5) { vertexRegion[v] = r; flipped++; }
  }

  // ---- Mirror symmetry: the left side is authoritative.
  const MIRROR: Record<number, number> = {};
  for (const [l, r] of [['left_arm', 'right_arm'], ['left_leg', 'right_leg']] as const) {
    MIRROR[REGIONS.indexOf(l)] = REGIONS.indexOf(r);
    MIRROR[REGIONS.indexOf(r)] = REGIONS.indexOf(l);
  }
  const bucket = new Map<string, number[]>();
  const bkey = (i: number) => `${obj.verts[i * 3 + 1].toFixed(3)},${obj.verts[i * 3 + 2].toFixed(3)}`;
  for (let c = 0; c < skinVertexCount(groups, indices); c++) {
    const k = bkey(source[c]);
    (bucket.get(k) ?? bucket.set(k, []).get(k)!).push(c);
  }
  const mirror = new Int32Array(N).fill(-1);
  let paired = 0;
  const skinN = skinVertexCount(groups, indices);
  for (let c = 0; c < skinN; c++) {
    const s = source[c];
    const cands = bucket.get(bkey(s)) ?? [];
    for (const d of cands) {
      if (Math.abs(obj.verts[source[d] * 3] + obj.verts[s * 3]) < 1e-3) { mirror[c] = d; paired++; break; }
    }
  }
  let symFixed = 0;
  for (let c = 0; c < skinN; c++) {
    const d = mirror[c];
    if (d < 0 || obj.verts[source[c] * 3] <= 0) continue; // walk from the left (+x) side
    const want = MIRROR[vertexRegion[c]] ?? vertexRegion[c];
    if (vertexRegion[d] !== want) { vertexRegion[d] = want; symFixed++; }
  }
  // Recompute face regions after the fixes.
  for (let f = 0; f < faceRegionArr.length; f++) {
    const a = indices[f * 3], b = indices[f * 3 + 1], c = indices[f * 3 + 2];
    const counts = new Map<number, number>();
    for (const v of [a, b, c]) counts.set(vertexRegion[v], (counts.get(vertexRegion[v]) ?? 0) + 1);
    let r = 0, rc = -1;
    for (const [reg, n] of [...counts].sort((p, q) => p[0] - q[0])) if (n > rc) { rc = n; r = reg; }
    faceRegionArr[f] = r;
  }

  // ---- Positions / uvs (compact).
  const positions = new Float32Array(N * 3);
  const uvs = new Float32Array(N * 2);
  for (let c = 0; c < N; c++) {
    const s = source[c];
    positions.set(obj.verts.subarray(s * 3, s * 3 + 3), c * 3);
    const t = obj.vertUv[s];
    if (t >= 0) uvs.set(obj.uvs.subarray(t * 2, t * 2 + 2), c * 2);
  }

  // ---- Boundary loops of the skin.
  const loops = boundaryLoops(indices, skin.start, skin.count, faceRegionArr);
  const openLoops = loops.filter((l) => l.open);
  const holes = holeEdges(indices, skin.start, skin.count);

  // ---- Targets.
  const plan = targetPlan();
  const targets: { name: string; target: SparseTarget }[] = [];
  for (const [name, files] of plan) {
    const maps = [];
    for (const f of files) maps.push(parseTarget(await fetchText(f)));
    targets.push({ name, target: quantise(maps.length > 1 ? averageTargets(maps) : maps[0], compact) });
  }

  // ---- Landmarks from joint helper groups.
  const landmarks: Record<string, [number, number, number]> = {};
  for (const [g, quads] of obj.groups) {
    if (!g.startsWith('joint-')) continue;
    const ids = new Set(quads.flat());
    let sx = 0, sy = 0, sz = 0;
    for (const i of ids) { sx += obj.verts[i * 3]; sy += obj.verts[i * 3 + 1]; sz += obj.verts[i * 3 + 2]; }
    landmarks[g.slice(6)] = [sx / ids.size, sy / ids.size, sz / ids.size].map((v) => +v.toFixed(4)) as [number, number, number];
  }

  // ---- Eyes.
  const eyeInfo = (name: string) => {
    const ids = new Set(obj.groups.get(name)!.flat());
    let sx = 0, sy = 0, sz = 0;
    for (const i of ids) { sx += obj.verts[i * 3]; sy += obj.verts[i * 3 + 1]; sz += obj.verts[i * 3 + 2]; }
    const c = [sx / ids.size, sy / ids.size, sz / ids.size];
    let r = 0;
    for (const i of ids) r += Math.hypot(obj.verts[i * 3] - c[0], obj.verts[i * 3 + 1] - c[1], obj.verts[i * 3 + 2] - c[2]);
    return { center: c.map((v) => +v.toFixed(4)), radius: +(r / ids.size).toFixed(4) };
  };

  // ---- Slices on the template.
  const scan = (lo: number, hi: number, rule: { xMin?: number; xMax?: number }, pick: 'min' | 'max') => {
    let bestY = lo, best = pick === 'min' ? Infinity : -Infinity;
    for (let yy = lo; yy <= hi + 1e-9; yy += 0.05) {
      const p = pickSlice(sliceLoops(positions, indices, skin.start, skin.count, yy), rule);
      if (p <= 0) continue;
      if (pick === 'min' ? p < best : p > best) { best = p; bestY = yy; }
    }
    return +bestY.toFixed(2);
  };
  const torsoRule = { xMin: -0.5, xMax: 0.5 };
  const breastCentroid = (() => {
    let sy = 0, sw = 0;
    for (const b of ['breast.L', 'breast.R']) for (const [vi, w] of weights[b]) { sy += y(vi) * w; sw += w; }
    return +(sy / sw).toFixed(2);
  })();
  const armY = +((landmarks['l-shoulder'][1] + landmarks['l-elbow'][1]) / 2).toFixed(2);
  const thighY = +((landmarks['l-upper-leg'][1] + landmarks['l-knee'][1]) / 2).toFixed(2);
  const slices: Slice[] = [
    { id: 'waist', y: scan(1.0, 3.2, torsoRule, 'min'), ...torsoRule, scan: { lo: 1.4, hi: 3.2, pick: 'min' } },
    { id: 'hip', y: scan(0.0, 1.6, torsoRule, 'max'), ...torsoRule, scan: { lo: 0.0, hi: 1.6, pick: 'max' } },
    { id: 'chest', y: breastCentroid, ...torsoRule },
    { id: 'left_upper_arm', y: armY, xMin: 1.5 },
    { id: 'right_upper_arm', y: armY, xMax: -1.5 },
    { id: 'left_thigh', y: thighY, xMin: 0.15, xMax: 1.6 },
    { id: 'right_thigh', y: thighY, xMin: -1.6, xMax: -0.15 },
  ];

  // ---- Linear models: volumes and circumferences at base and with each target at 1.
  const measure = (p: Float32Array) => {
    const vol = regionVolumes(p, indices, skin.start, skin.count, faceRegionArr, loops, REGIONS.length);
    const volumes: Record<string, number> = {};
    let total = 0;
    REGIONS.forEach((r, i) => { volumes[r] = +vol[i].toFixed(5); total += vol[i]; });
    volumes.total = +total.toFixed(5);
    const circ: Record<string, number> = {};
    for (const s of slices) circ[s.id] = +circumference(p, indices, skin.start, skin.count, s).toFixed(5);
    return { volumes, circ };
  };
  const base = measure(positions);
  const scratch = new Float32Array(N * 3);
  const perTarget = targets.map(({ name, target }) => {
    blendInto(positions, scratch, [{ target, weight: 1 }]);
    const m = measure(scratch);
    const dV: Record<string, number> = {}, dC: Record<string, number> = {};
    for (const k of Object.keys(base.volumes)) dV[k] = +(m.volumes[k] - base.volumes[k]).toFixed(5);
    for (const k of Object.keys(base.circ)) dC[k] = +(m.circ[k] - base.circ[k]).toFixed(5);
    return { name, dV, dC };
  });

  // ---- Binary layout: 4-byte aligned views.
  const chunks: { name: string; data: ArrayBufferView; dtype: string; extra?: Record<string, unknown> }[] = [];
  const posMax = positions.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const posScale = posMax / 32767;
  chunks.push({ name: 'positions', data: Int16Array.from(positions, (v) => Math.round(v / posScale)), dtype: 'int16', extra: { scale: posScale } });
  chunks.push({ name: 'uvs', data: Uint16Array.from(uvs, (v) => Math.round(Math.min(1, Math.max(0, v)) * 65535)), dtype: 'uint16', extra: { scale: 1 / 65535 } });
  chunks.push({ name: 'indices', data: indices, dtype: 'uint16' });
  chunks.push({ name: 'faceRegion', data: faceRegionArr, dtype: 'uint8' });
  chunks.push({ name: 'vertexRegion', data: vertexRegion, dtype: 'uint8' });
  const loopVerts = Uint16Array.from(loops.flatMap((l) => l.vertices));
  chunks.push({ name: 'loops', data: loopVerts, dtype: 'uint16' });
  const tIdx = Uint16Array.from(targets.flatMap((t) => [...t.target.indices]));
  const tOff = Int16Array.from(targets.flatMap((t) => [...t.target.offsets]));
  chunks.push({ name: 'targetIndices', data: tIdx, dtype: 'uint16' });
  chunks.push({ name: 'targetOffsets', data: tOff, dtype: 'int16' });

  let offset = 0;
  const views: Record<string, unknown> = {};
  const parts: Uint8Array[] = [];
  for (const c of chunks) {
    const bytes = new Uint8Array(c.data.buffer, c.data.byteOffset, c.data.byteLength);
    views[c.name] = { offset, length: (c.data as ArrayLike<number>).length, dtype: c.dtype, ...c.extra };
    parts.push(bytes);
    offset += bytes.length;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(new Uint8Array(pad)); offset += pad; }
  }
  const bin = new Uint8Array(offset);
  let o = 0;
  for (const p of parts) { bin.set(p, o); o += p.length; }

  let loopOffset = 0;
  const loopMeta = loops.map((l) => {
    const m = { region: l.region, offset: loopOffset, count: l.vertices.length, open: l.open };
    loopOffset += l.vertices.length;
    return m;
  });
  let ti = 0;
  const targetMeta = targets.map((t) => {
    const m = { name: t.name, offset: ti, count: t.target.indices.length, scale: t.target.scale };
    ti += t.target.indices.length;
    return m;
  });

  const skinY = { min: Infinity, max: -Infinity };
  for (let c = 0; c < skinN; c++) { skinY.min = Math.min(skinY.min, positions[c * 3 + 1]); skinY.max = Math.max(skinY.max, positions[c * 3 + 1]); }

  const manifest = {
    version: 1,
    source: { project: 'MakeHuman', sha: SHA, license: 'CC0-1.0', url: BASE },
    units: 'dm',
    vertexCount: N,
    faceCount: indices.length / 3,
    skinVertexCount: skinN,
    views,
    groups,
    regions: REGIONS,
    loops: loopMeta,
    targets: targetMeta,
    eyes: { left: eyeInfo('helper-l-eye'), right: eyeInfo('helper-r-eye'), forward: [0, 0, 1] },
    landmarks,
    slices,
    cloth: CLOTH,
    template: { heightDm: +(skinY.max - skinY.min).toFixed(4), minY: +skinY.min.toFixed(4), maxY: +skinY.max.toFixed(4) },
    volumeModel: { base: base.volumes, perTarget: perTarget.map((t) => ({ name: t.name, dV: t.dV })) },
    circumferenceModel: { base: base.circ, perTarget: perTarget.map((t) => ({ name: t.name, dC: t.dC })) },
    dropped: [
      'macro height family (height is uniform scaling at runtime)',
      'macro proportions', 'old-age variants of weight and muscle deltas', 'neck, breast and face modifiers',
    ],
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'body.bin'), bin);
  writeFileSync(join(OUT, 'body.json'), JSON.stringify(manifest));
  writeFileSync(join(OUT, 'NOTICE.txt'), `Body mesh and morph targets derived from MakeHuman (https://www.makehuman.org)
Source commit: makehumancommunity/makehuman @ ${SHA}
License of the assets: CC0 1.0 Universal (see makehuman/LICENSE.md, section C).
Files used: 3dobjs/base.obj, rigs/default_weights.mhw, and these targets:
${plan.flatMap(([, f]) => f).map((f) => '  ' + f).join('\n')}
Built by scripts/build-body-asset.ts. Regenerate with: npm run build:body
`);

  const sha256 = createHash('sha256').update(bin).digest('hex').slice(0, 12);
  console.log(`vertices ${N} (skin ${skinN}), faces ${indices.length / 3}, groups`, groups.map((g) => `${g.name}:${g.count}`).join(' '));
  console.log(`regions`, REGIONS.map((r, i) => `${r}:${[...vertexRegion.slice(0, skinN)].filter((v) => v === i).length}`).join(' '));
  console.log(`speckles flipped ${flipped}, mirror pairs ${paired}/${skinN}, symmetry fixes ${symFixed}`);
  console.log(`loops ${loops.length} (open ${openLoops.length}), hole edges ${holes.size}, targets ${targets.length}`);
  console.log(`template height ${manifest.template.heightDm} dm; volumes L`, Object.fromEntries(Object.entries(base.volumes).map(([k, v]) => [k, +(v).toFixed(2)])));
  console.log(`slices`, slices.map((s) => `${s.id}@${s.y}=${base.circ[s.id].toFixed(2)}`).join(' '));
  console.log(`body.bin ${(bin.length / 1024).toFixed(0)} KB sha256 ${sha256}`);
}

function skinVertexCount(groups: { name: string; start: number; count: number }[], indices: Uint16Array): number {
  const skin = groups[0];
  let max = 0;
  for (let f = skin.start; f < skin.start + skin.count; f++) for (let k = 0; k < 3; k++) max = Math.max(max, indices[f * 3 + k]);
  return max + 1;
}

function holeEdges(indices: Uint16Array, start: number, count: number): Set<string> {
  const seen = new Map<string, number>();
  for (let f = start; f < start + count; f++) {
    const t = [indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return new Set([...seen].filter(([, n]) => n === 1).map(([k]) => k));
}

main().catch((e) => { console.error(e); process.exit(1); });
