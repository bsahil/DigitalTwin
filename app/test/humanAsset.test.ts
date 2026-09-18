import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { parseHumanAsset, HumanMesh, type Manifest } from '../src/lib/humanMesh';
import { REGIONS, blendInto, regionVolumes } from '../src/lib/meshMath';

const url = (n: string) => new URL(`../public/body/${n}`, import.meta.url);

export function loadAsset() {
  const manifest = JSON.parse(readFileSync(url('body.json'), 'utf8')) as Manifest;
  const buf = readFileSync(url('body.bin'));
  return parseHumanAsset(manifest, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}

describe('the shipped body asset', () => {
  const asset = loadAsset();
  const m = asset.manifest;

  test('is MakeHuman data under CC0 at a pinned commit', () => {
    expect(m.source.license).toBe('CC0-1.0');
    expect(m.source.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  test('views round-trip to the counts the manifest declares', () => {
    expect(asset.positions.length).toBe(m.vertexCount * 3);
    expect(asset.uvs.length).toBe(m.vertexCount * 2);
    expect(asset.indices.length).toBe(m.faceCount * 3);
    expect(asset.faceRegion.length).toBe(m.faceCount);
    expect(asset.vertexRegion.length).toBe(m.vertexCount);
    for (const i of asset.indices) expect(i).toBeLessThan(m.vertexCount);
  });

  test('groups are contiguous, in order, and cover every face', () => {
    const names = m.groups.map((g) => g.name);
    expect(names).toEqual(['skin', 'brief', 'top', 'eyes']);
    let cursor = 0;
    for (const g of m.groups) {
      expect(g.start).toBe(cursor);
      expect(g.count).toBeGreaterThan(0);
      cursor += g.count;
    }
    expect(cursor).toBe(m.faceCount);
  });

  test('every target indexes only existing vertices and moves something', () => {
    expect(asset.targets.size).toBeGreaterThanOrEqual(50);
    for (const [name, t] of asset.targets) {
      expect(t.indices.length, name).toBeGreaterThan(0);
      expect(t.offsets.length).toBe(t.indices.length * 3);
      expect(t.scale).toBeGreaterThan(0);
      for (const i of t.indices) expect(i).toBeLessThan(m.vertexCount);
    }
    for (const needed of ['macro-female-young', 'macro-male-young', 'weight-female-max', 'muscle-male-max', 'l-upperarm-fat-incr', 'torso-scale-horiz-incr', 'stomach-tone-decr']) {
      expect(asset.targets.has(needed), needed).toBe(true);
    }
  });

  test('regions are named in RegionId order and left/right are mirror images', () => {
    expect([...m.regions]).toEqual([...REGIONS]);
    const count = (r: string) => {
      const idx = m.regions.indexOf(r);
      let n = 0;
      for (let i = 0; i < m.skinVertexCount; i++) if (asset.vertexRegion[i] === idx) n++;
      return n;
    };
    expect(count('left_arm')).toBe(count('right_arm'));
    expect(count('left_leg')).toBe(count('right_leg'));
    for (const r of REGIONS) expect(count(r), r).toBeGreaterThan(100);
  });

  test('the skin is watertight and every region boundary is a closed loop', () => {
    for (const l of asset.loops) {
      expect(l.open).toBe(false);
      expect(l.vertices.length).toBeGreaterThanOrEqual(3);
    }
    const skin = m.groups[0];
    const seen = new Map<string, number>();
    for (let f = skin.start; f < skin.start + skin.count; f++) {
      const t = [asset.indices[f * 3], asset.indices[f * 3 + 1], asset.indices[f * 3 + 2]];
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect([...seen.values()].filter((n) => n !== 2)).toHaveLength(0);
  });

  test('the template is a plausible adult: ~1.67 m tall, ~54 L, waist under hip under chest', () => {
    expect(m.template.heightDm).toBeGreaterThan(16);
    expect(m.template.heightDm).toBeLessThan(17.5);
    const base = m.volumeModel.base;
    expect(base.total).toBeGreaterThan(45);
    expect(base.total).toBeLessThan(65);
    expect(base.trunk).toBeGreaterThan(base.left_leg);
    expect(base.left_leg).toBeGreaterThan(base.left_arm);
    const c = m.circumferenceModel.base;
    expect(c.waist).toBeLessThan(c.hip);
    expect(c.waist * 10).toBeGreaterThan(55);
    expect(c.waist * 10).toBeLessThan(85);
  });

  test('region volumes sum to the whole-body volume, at build time and when recomputed', () => {
    const base = m.volumeModel.base;
    const sum = REGIONS.reduce((s, r) => s + base[r], 0);
    expect(sum).toBeCloseTo(base.total, 3);
    const skin = m.groups[0];
    const v = regionVolumes(asset.positions, asset.indices, skin.start, skin.count, asset.faceRegion, asset.loops, REGIONS.length);
    REGIONS.forEach((r, i) => expect(v[i]).toBeCloseTo(base[r], 3));
  });

  test('the linear volume model predicts the blended mesh within 8 % for random bounded weights', () => {
    const skin = m.groups[0];
    const names = m.targets.map((t) => t.name).filter((n) => !n.startsWith('macro-'));
    const out = new Float32Array(asset.positions.length);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 20; trial++) {
      const weights: Record<string, number> = {};
      const predicted = { ...m.volumeModel.base };
      for (const n of names) {
        if (rand() < 0.75) continue;
        const w = rand() * 0.8;
        weights[n] = w;
        const dV = m.volumeModel.perTarget.find((t) => t.name === n)!.dV;
        for (const k of Object.keys(predicted)) predicted[k] += dV[k] * w;
      }
      blendInto(asset.positions, out, [...Object.entries(weights)].map(([n, w]) => ({ target: asset.targets.get(n)!, weight: w })));
      const v = regionVolumes(out, asset.indices, skin.start, skin.count, asset.faceRegion, asset.loops, REGIONS.length);
      const total = v.reduce((s, x) => s + x, 0);
      expect(Math.abs(total - predicted.total) / total).toBeLessThan(0.08);
      for (const r of ['trunk', 'left_arm', 'left_leg'] as const) {
        const i = REGIONS.indexOf(r);
        expect(Math.abs(v[i] - predicted[r]) / v[i], `${r} trial ${trial}`).toBeLessThan(0.08);
      }
    }
  });

  test('HumanMesh blends deterministically and zero weights reproduce the template', () => {
    const h = new HumanMesh(asset);
    const a = h.setShape({}, m.template.heightDm * 0.1);
    expect(a.volumesL.total).toBeCloseTo(m.volumeModel.base.total, 2);
    const pos = () => Float32Array.from((h.geometry.getAttribute('position').array as Float32Array));
    h.setShape({ 'macro-male-young': 1, 'weight-male-max': 0.4 }, 1.8);
    const p1 = pos();
    h.setShape({}, 1.6);
    h.setShape({ 'macro-male-young': 1, 'weight-male-max': 0.4 }, 1.8);
    expect(pos()).toEqual(p1);
    expect(h.heightM).toBeCloseTo(1.8, 6);
    let minY = Infinity;
    for (let i = 1; i < p1.length; i += 3) minY = Math.min(minY, p1[i]);
    expect(minY).toBeCloseTo(0, 6);
  });

  test('eyeballs sit in the head, symmetric about the centre line', () => {
    const h = new HumanMesh(asset);
    h.setShape({ 'macro-female-young': 1 }, 1.65);
    const { left, right } = h.eyeCentres();
    expect(left.x).toBeGreaterThan(0.02);
    expect(right.x).toBeCloseTo(-left.x, 4);
    expect(left.y).toBeGreaterThan(1.45);
    expect(left.y).toBeLessThan(1.62);
    expect(left.z).toBeGreaterThan(0.05);
  });
});
