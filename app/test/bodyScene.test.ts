import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildBodyModel, type MetricValues } from '../src/lib/bodyModel';
import {
  applyLayer,
  buildSegmentMeshes,
  pickRegion,
  type Layer,
  type MeshTag,
} from '../src/lib/bodyScene';

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
  right_leg_muscle_mass: 9,
  right_leg_fat_mass: 2,
};

const LAYERS: Layer[] = ['normal', 'fat', 'muscle', 'balance', 'inside'];

function scene(layer: Layer, selected: Parameters<typeof applyLayer>[2] = null) {
  const model = buildBodyModel(metrics, 175);
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 10);
  const meshes = buildSegmentMeshes(model, clip);
  applyLayer(meshes, layer, selected, model, clip);
  for (const m of meshes) m.updateMatrixWorld(true);
  return { model, meshes, clip };
}

const tagOf = (m: THREE.Object3D) => m.userData as MeshTag;
const mat = (m: THREE.Mesh) => m.material as THREE.MeshStandardMaterial;
const find = (meshes: THREE.Mesh[], region: string, role: string) =>
  meshes.find((m) => tagOf(m).regionId === region && tagOf(m).role === role)!;

describe('compartment visibility', () => {
  /**
   * The defect this guards against: a translucent shell that still writes depth hides
   * the core behind it, so the layer shows a tinted skin and calls it an inner form.
   */
  test('nothing translucent ever writes depth, in any layer', () => {
    for (const layer of LAYERS) {
      const { meshes } = scene(layer);
      for (const m of meshes) {
        if (!m.visible) continue;
        const material = mat(m);
        if (material.transparent && material.opacity < 1) {
          expect(material.depthWrite, `${layer}: ${tagOf(m).regionId}/${tagOf(m).role}`).toBe(false);
        }
      }
    }
  });

  test('inner compartments draw before the shell within every segment', () => {
    const { meshes, model } = scene('inside');
    for (const seg of model.segments.filter((s) => s.measured)) {
      const shell = find(meshes, seg.id, 'shell');
      const core = find(meshes, seg.id, 'core');
      expect(core.renderOrder).toBeLessThan(shell.renderOrder);
      if (seg.visceral) {
        const visceral = find(meshes, seg.id, 'visceral');
        expect(visceral.renderOrder).toBeLessThan(core.renderOrder);
      }
    }
  });

  test('the muscle layer draws the core solid and the shell translucent', () => {
    const { meshes } = scene('muscle');
    const core = find(meshes, 'trunk', 'core');
    const shell = find(meshes, 'trunk', 'shell');

    expect(core.visible).toBe(true);
    expect(mat(core).transparent).toBe(false);
    expect(mat(core).depthWrite).toBe(true);

    expect(mat(shell).opacity).toBeLessThan(1);
    expect(mat(shell).depthWrite).toBe(false);
  });

  test('the fat layer draws the visceral core solid, and hides the muscle core rather than making it invisible-but-occluding', () => {
    const { meshes } = scene('fat');
    const visceral = find(meshes, 'trunk', 'visceral');
    const core = find(meshes, 'trunk', 'core');
    const shell = find(meshes, 'trunk', 'shell');

    expect(visceral.visible).toBe(true);
    expect(mat(visceral).transparent).toBe(false);
    expect(core.visible).toBe(false);
    expect(mat(shell).opacity).toBeLessThan(1);
    expect(mat(shell).depthWrite).toBe(false);
  });

  test('the normal layer hides every compartment that is not the shell', () => {
    const { meshes } = scene('normal');
    for (const m of meshes) {
      const { role } = tagOf(m);
      if (role === 'core' || role === 'visceral' || role.startsWith('cap-')) {
        expect(m.visible, role).toBe(false);
      }
    }
  });

  test('the inside layer clips, shows the caps, and lets shells render both faces', () => {
    const { meshes, clip } = scene('inside');
    expect(clip.constant).toBe(0);
    expect(find(meshes, 'trunk', 'cap-fat').visible).toBe(true);
    expect(find(meshes, 'trunk', 'cap-visceral').visible).toBe(true);
    expect(mat(find(meshes, 'trunk', 'shell')).side).toBe(THREE.DoubleSide);

    const { meshes: normal, clip: c2 } = scene('normal');
    expect(c2.constant).toBeGreaterThan(1);
    expect(mat(find(normal, 'trunk', 'shell')).side).toBe(THREE.FrontSide);
  });

  test('selecting an unmeasured region changes what is on screen', () => {
    const idle = scene('normal');
    const chosen = scene('normal', 'head');
    const shellIdle = mat(find(idle.meshes, 'head', 'shell')).opacity;
    const shellChosen = mat(find(chosen.meshes, 'head', 'shell')).opacity;
    expect(shellChosen).toBeGreaterThan(shellIdle * 2);

    const wireIdle = mat(find(idle.meshes, 'head', 'wire')).opacity;
    const wireChosen = mat(find(chosen.meshes, 'head', 'wire')).opacity;
    expect(wireChosen).toBeGreaterThan(wireIdle * 2);
  });
});

describe('picking', () => {
  const rayThroughTrunk = (model: ReturnType<typeof buildBodyModel>) => {
    const trunk = model.segments.find((s) => s.id === 'trunk')!;
    const y = trunk.origin[1] - trunk.length / 2;
    return new THREE.Raycaster(new THREE.Vector3(0, y, 5), new THREE.Vector3(0, 0, -1));
  };

  test('a hidden compartment is never the thing you clicked', () => {
    const { meshes, model } = scene('normal');
    const ray = rayThroughTrunk(model);

    // Raycaster itself happily returns invisible meshes — this is why the filter exists.
    const raw = ray.intersectObjects(meshes, false);
    expect(raw.some((i) => !i.object.visible)).toBe(true);

    expect(pickRegion(meshes, ray)).toBe('trunk');
  });

  test('the same ray still resolves to the trunk in every layer', () => {
    for (const layer of LAYERS) {
      const { meshes, model } = scene(layer);
      expect(pickRegion(meshes, rayThroughTrunk(model)), layer).toBe('trunk');
    }
  });

  test('a ray through empty space picks nothing', () => {
    const { meshes, model } = scene('normal');
    const ray = new THREE.Raycaster(
      new THREE.Vector3(model.heightM, model.heightM / 2, 5),
      new THREE.Vector3(0, 0, -1),
    );
    expect(pickRegion(meshes, ray)).toBeNull();
  });
});
