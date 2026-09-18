import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildBodyModel, type MetricValues } from '../src/lib/bodyModel';
import { HumanMesh } from '../src/lib/humanMesh';
import { fitBody, fitInputFromModel } from '../src/lib/bodyFit';
import { COLORS, pickRegion, regionOverlay, writeOverlay, type Layer } from '../src/lib/bodyScene';
import { loadAsset } from './humanAsset.test';

const metrics: MetricValues = {
  weight: 70,
  fat_percentage: 20,
  trunk_muscle_mass: 25,
  trunk_fat_mass: 7,
  visceral_fat_mass: 1.5,
  left_arm_muscle_mass: 3,
  left_arm_fat_mass: 1,
  right_arm_muscle_mass: 3,
  right_arm_fat_mass: 1,
  left_leg_muscle_mass: 9,
  left_leg_fat_mass: 2,
  right_leg_muscle_mass: 8,
  right_leg_fat_mass: 2,
};

const LAYERS: Layer[] = ['normal', 'fat', 'muscle', 'balance'];
const model = buildBodyModel(metrics, 175);
const human = new HumanMesh(loadAsset());
const fit = fitBody(human, fitInputFromModel(model, { sex: 'Male', age: 30 }, metrics));
human.setShape(fit.weights, model.heightM);
const body = new THREE.Mesh(human.geometry);
body.updateMatrixWorld(true);

describe('region overlay', () => {
  test('the body layer shows pure skin until something is hovered or selected', () => {
    const o = regionOverlay(model, 'normal', null, null);
    for (const e of Object.values(o)) expect(e!.alpha).toBe(0);
  });

  test('hover and selection tint in the body layer, and a selection dims the rest', () => {
    const o = regionOverlay(model, 'normal', 'trunk', 'left_arm');
    expect(o.trunk!.alpha).toBeGreaterThan(o.left_arm!.alpha);
    expect(o.left_arm!.alpha).toBeGreaterThan(0);
    expect(o.trunk!.color.getHex()).toBe(COLORS.accent);
    expect(o.right_arm!.alpha).toBeGreaterThan(0);
    expect(o.right_arm!.color.getHex()).toBe(COLORS.dim);
  });

  test('data layers colour every measured region strongly enough to read on any skin', () => {
    for (const layer of ['fat', 'muscle', 'balance'] as const) {
      const o = regionOverlay(model, layer, null, null);
      for (const s of model.segments) {
        expect(o[s.id]!.alpha, `${layer} ${s.id}`).toBeGreaterThan(s.measured ? 0.7 : 0.4);
      }
      expect(o.head!.color.getHex()).toBe(COLORS.unmeasured);
    }
  });

  test('the balance layer paints the heavier leg blue and the lighter one orange', () => {
    const o = regionOverlay(model, 'balance', null, null);
    const heavier = new THREE.Color(COLORS.balanceHigh), lighter = new THREE.Color(COLORS.balanceLow);
    const dist = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(dist(o.left_leg!.color, heavier)).toBeLessThan(dist(o.left_leg!.color, lighter));
    expect(dist(o.right_leg!.color, lighter)).toBeLessThan(dist(o.right_leg!.color, heavier));
  });

  test('writing the overlay fills the RGBA attribute for every vertex of the region, cloth included', () => {
    writeOverlay(human, regionOverlay(model, 'fat', null, null));
    const attr = human.geometry.getAttribute('color') as THREE.BufferAttribute;
    const trunkVerts = human.vertexIndicesOf('trunk');
    expect(trunkVerts.length).toBeGreaterThan(1000);
    const expected = regionOverlay(model, 'fat', null, null).trunk!;
    for (const i of trunkVerts.slice(0, 50)) {
      expect(attr.getW(i)).toBeCloseTo(expected.alpha, 5);
      expect(attr.getX(i)).toBeCloseTo(expected.color.r, 5);
    }
    expect(trunkVerts.some((i) => i >= human.asset.manifest.skinVertexCount)).toBe(true);
  });
});

describe('picking on the real geometry', () => {
  const rayAt = (p: THREE.Vector3, dir = new THREE.Vector3(0, 0, -1)) =>
    new THREE.Raycaster(new THREE.Vector3(p.x, p.y, 5), dir);

  test('a ray through the trunk centroid picks the trunk in every layer', () => {
    const c = human.regionCentroid('trunk');
    for (const layer of LAYERS) {
      writeOverlay(human, regionOverlay(model, layer, null, null));
      expect(pickRegion(human, body, rayAt(c)), layer).toBe('trunk');
    }
  });

  test('a ray through the left arm picks the left arm, which sits on +x', () => {
    const c = human.regionCentroid('left_arm');
    expect(c.x).toBeGreaterThan(0.1);
    expect(pickRegion(human, body, rayAt(c))).toBe('left_arm');
  });

  test('a ray through the thigh picks a leg', () => {
    const c = human.regionCentroid('right_leg');
    expect(pickRegion(human, body, rayAt(c))).toBe('right_leg');
  });

  test('a ray through empty space picks nothing', () => {
    expect(pickRegion(human, body, rayAt(new THREE.Vector3(model.heightM, model.heightM / 2, 0)))).toBeNull();
  });
});
