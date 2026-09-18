/**
 * Geometry arithmetic shared by the asset build script and the runtime body.
 *
 * Everything here is plain typed arrays: no three.js, no DOM, so the same code
 * that measures the shipped asset at build time measures the blended body in the
 * browser, and a vitest can hold the two to the same numbers.
 *
 * Units are whatever the positions are in. MakeHuman's base mesh is in decimetres.
 */

/** Region order is the manifest's enum order; it mirrors RegionId in bodyModel.ts. */
export const REGIONS = [
  'trunk',
  'left_arm',
  'right_arm',
  'left_leg',
  'right_leg',
  'head',
  'neck',
  'hands',
  'feet',
] as const;
export type RegionName = (typeof REGIONS)[number];

/** A boundary of one region: ordered vertex ids, closed unless `open`. */
export interface Loop {
  region: number;
  vertices: number[];
  open: boolean;
}

export interface SparseTarget {
  /** Compact vertex ids this target moves. */
  indices: Uint16Array;
  /** Quantised xyz offsets, three per index; multiply by `scale`. */
  offsets: Int16Array;
  scale: number;
}

/** Slice rule: which cross-section loop at height `y` is the one we mean. */
export interface Slice {
  id: string;
  y: number;
  /** Loop centroid x must satisfy these (same units as positions). */
  xMin?: number;
  xMax?: number;
  /** When set, scan y over [lo, hi] and take the smallest or largest qualifying loop. */
  scan?: { lo: number; hi: number; pick: 'min' | 'max'; step?: number };
}

/** out = base + Σ weight · target, sparse. Only |weight| > eps is applied. */
export function blendInto(
  base: Float32Array,
  out: Float32Array,
  targets: Iterable<{ target: SparseTarget; weight: number }>,
  eps = 1e-4,
): void {
  out.set(base);
  for (const { target, weight } of targets) {
    if (Math.abs(weight) <= eps) continue;
    const k = weight * target.scale;
    const { indices, offsets } = target;
    for (let i = 0; i < indices.length; i++) {
      const v = indices[i] * 3;
      const o = i * 3;
      out[v] += offsets[o] * k;
      out[v + 1] += offsets[o + 1] * k;
      out[v + 2] += offsets[o + 2] * k;
    }
  }
}

function tetra(p: ArrayLike<number>, a: number, b: number, c: number): number {
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
  const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
  const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
  return (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
}

/**
 * Directed boundary edges of every region, chained into loops. An edge a→b of a
 * face in region r is a boundary when the face on the other side (b→a) belongs to a
 * different region or does not exist (a hole). Holes are capped like region cuts,
 * so a region's volume is the volume of its closed surface.
 */
export function boundaryLoops(
  indices: ArrayLike<number>,
  faceStart: number,
  faceCount: number,
  faceRegion: ArrayLike<number>,
): Loop[] {
  const owner = new Map<number, number>(); // directed edge key -> region
  const key = (a: number, b: number) => a * 65536 + b;
  for (let f = faceStart; f < faceStart + faceCount; f++) {
    const a = indices[f * 3], b = indices[f * 3 + 1], c = indices[f * 3 + 2];
    const r = faceRegion[f];
    owner.set(key(a, b), r);
    owner.set(key(b, c), r);
    owner.set(key(c, a), r);
  }

  // Outgoing boundary edges per region, keyed by start vertex.
  const next = new Map<number, Map<number, number[]>>();
  for (const [k, r] of owner) {
    const a = Math.floor(k / 65536), b = k % 65536;
    const back = owner.get(key(b, a));
    if (back === r) continue;
    let m = next.get(r);
    if (!m) next.set(r, (m = new Map()));
    let list = m.get(a);
    if (!list) m.set(a, (list = []));
    list.push(b);
  }

  const loops: Loop[] = [];
  for (const [r, m] of next) {
    const used = new Set<number>();
    for (const [start, outs] of m) {
      for (const first of outs) {
        if (used.has(key(start, first))) continue;
        const verts = [start];
        let a = start, b = first;
        used.add(key(a, b));
        let open = false;
        for (;;) {
          verts.push(b);
          if (b === start) break;
          const cands = m.get(b);
          let found = -1;
          if (cands) for (const c of cands) if (!used.has(key(b, c))) { found = c; break; }
          if (found < 0) { open = true; break; }
          a = b; b = found;
          used.add(key(a, b));
        }
        if (!open) verts.pop(); // last equals start
        loops.push({ region: r, vertices: verts, open });
      }
    }
  }
  return loops;
}

/**
 * Volume enclosed by each region: signed tetrahedra over its faces plus a fan cap
 * over every boundary loop, traversed against the region's edge direction so the
 * cap's normal points outward. Caps of neighbouring regions cancel exactly, so the
 * sum over regions is the volume of the whole closed mesh.
 */
export function regionVolumes(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  faceStart: number,
  faceCount: number,
  faceRegion: ArrayLike<number>,
  loops: Loop[],
  regionCount: number,
): Float64Array {
  const v = new Float64Array(regionCount);
  for (let f = faceStart; f < faceStart + faceCount; f++) {
    v[faceRegion[f]] += tetra(positions, indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]);
  }
  for (const loop of loops) {
    const n = loop.vertices.length;
    if (n < 3) continue;
    let cx = 0, cy = 0, cz = 0;
    for (const i of loop.vertices) { cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2]; }
    cx /= n; cy /= n; cz /= n;
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const a = loop.vertices[k], b = loop.vertices[(k + 1) % n];
      // Triangle (centroid, b, a): reversed relative to the region's edge a→b.
      const ax = positions[a * 3] - cx, ay = positions[a * 3 + 1] - cy, az = positions[a * 3 + 2] - cz;
      const bx = positions[b * 3] - cx, by = positions[b * 3 + 1] - cy, bz = positions[b * 3 + 2] - cz;
      // Volume of tetra (origin, c, b, a) = c · (b × a) / 6 with c the centroid.
      const nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax;
      sum += (cx * nx + cy * ny + cz * nz) / 6;
    }
    v[loop.region] += sum;
  }
  return v;
}

export interface SliceLoop {
  perimeter: number;
  cx: number;
  cz: number;
}

/**
 * Cross-section of the mesh at height y: every triangle crossing the plane gives a
 * segment whose ends are identified by the edge they lie on, so chaining is exact.
 */
export function sliceLoops(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  faceStart: number,
  faceCount: number,
  y: number,
): SliceLoop[] {
  // Nudge so no vertex sits exactly on the plane.
  const yy = y + 1e-7;
  const points = new Map<number, [number, number]>(); // edge key -> (x, z)
  const adj = new Map<number, number[]>(); // edge key -> connected edge keys
  const ekey = (a: number, b: number) => (a < b ? a * 65536 + b : b * 65536 + a);
  const cross = (a: number, b: number): number | null => {
    const ya = positions[a * 3 + 1], yb = positions[b * 3 + 1];
    if ((ya < yy) === (yb < yy)) return null;
    const t = (yy - ya) / (yb - ya);
    const k = ekey(a, b);
    if (!points.has(k)) {
      points.set(k, [
        positions[a * 3] + t * (positions[b * 3] - positions[a * 3]),
        positions[a * 3 + 2] + t * (positions[b * 3 + 2] - positions[a * 3 + 2]),
      ]);
    }
    return k;
  };
  for (let f = faceStart; f < faceStart + faceCount; f++) {
    const a = indices[f * 3], b = indices[f * 3 + 1], c = indices[f * 3 + 2];
    const hits = [cross(a, b), cross(b, c), cross(c, a)].filter((k): k is number => k !== null);
    if (hits.length !== 2) continue;
    const [p, q] = hits;
    (adj.get(p) ?? adj.set(p, []).get(p)!).push(q);
    (adj.get(q) ?? adj.set(q, []).get(q)!).push(p);
  }

  const seen = new Set<number>();
  const out: SliceLoop[] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    let prev = -1, cur = start;
    let perimeter = 0, sx = 0, sz = 0, n = 0;
    for (;;) {
      seen.add(cur);
      const [x, z] = points.get(cur)!;
      sx += x; sz += z; n++;
      const nb = adj.get(cur)!;
      const nxt = nb.find((k) => k !== prev && !seen.has(k)) ?? (nb.includes(start) && cur !== start ? start : undefined);
      if (nxt === undefined) break;
      const [x2, z2] = points.get(nxt)!;
      perimeter += Math.hypot(x2 - x, z2 - z);
      if (nxt === start) break;
      prev = cur; cur = nxt;
    }
    out.push({ perimeter, cx: sx / n, cz: sz / n });
  }
  return out;
}

/** The perimeter of the loop a slice rule means, or 0 when no loop qualifies. */
export function pickSlice(loops: SliceLoop[], slice: Pick<Slice, 'xMin' | 'xMax'>): number {
  let best = 0;
  for (const l of loops) {
    if (slice.xMin !== undefined && l.cx < slice.xMin) continue;
    if (slice.xMax !== undefined && l.cx > slice.xMax) continue;
    if (l.perimeter > best) best = l.perimeter;
  }
  return best;
}

export function circumference(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  faceStart: number,
  faceCount: number,
  slice: Slice,
): number {
  if (!slice.scan) return pickSlice(sliceLoops(positions, indices, faceStart, faceCount, slice.y), slice);
  const { lo, hi, pick, step = 0.1 } = slice.scan;
  let best = 0;
  for (let y = lo; y <= hi + 1e-9; y += step) {
    const p = pickSlice(sliceLoops(positions, indices, faceStart, faceCount, y), slice);
    if (p <= 0) continue;
    if (best === 0 || (pick === 'min' ? p < best : p > best)) best = p;
  }
  return best;
}
