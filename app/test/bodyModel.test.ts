import { readFileSync, existsSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { parsePdf } from '../src/lib/parser';
import { buildBodyModel, type MetricValues, type Segment } from '../src/lib/bodyModel';

const fixture = (n: string) => new URL(`./fixtures/${n}`, import.meta.url);
const has = (n: string) => existsSync(fixture(n));

async function modelFor(file: string) {
  const buf = readFileSync(fixture(file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const parsed = await parsePdf(ab);

  const metrics: MetricValues = {};
  for (const m of parsed.metrics) {
    if (typeof m.value === 'number') metrics[m.canonical_name] = m.value;
  }
  return { model: buildBodyModel(metrics, parsed.height_cm_derived!), metrics, parsed };
}

/** Volume of the solid of revolution described by a radii profile: π L ∫ r² dt. */
function volumeOf(radii: number[], length: number): number {
  const n = radii.length - 1;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (radii[i] ** 2 + radii[i + 1] ** 2) / 2;
  return Math.PI * length * (sum / n) * 1000; // litres
}

const seg = (segments: Segment[], id: string) => segments.find((s) => s.id === id)!;

describe('volume derivation', () => {
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

  test('a segment holds exactly the volume its measured mass implies', () => {
    const { segments } = buildBodyModel(metrics, 175);
    const leg = seg(segments, 'left_leg');

    const expected = 9 / 1.06 + 2 / 0.9;
    expect(volumeOf(leg.outer, leg.length)).toBeCloseTo(expected, 4);
    expect(leg.volumeL).toBeCloseTo(expected, 6);
  });

  test('the muscle shell holds only the lean volume', () => {
    const { segments } = buildBodyModel(metrics, 175);
    const leg = seg(segments, 'left_leg');
    expect(volumeOf(leg.muscle, leg.length)).toBeCloseTo(9 / 1.06, 4);
  });

  test('the trunk nests visceral inside muscle inside fat', () => {
    const { segments } = buildBodyModel(metrics, 175);
    const trunk = seg(segments, 'trunk');

    expect(trunk.visceral).toBeDefined();
    for (let i = 0; i < trunk.outer.length; i++) {
      expect(trunk.visceral![i]).toBeLessThan(trunk.muscle[i]);
      expect(trunk.muscle[i]).toBeLessThan(trunk.outer[i]);
    }
    expect(volumeOf(trunk.visceral!, trunk.length)).toBeCloseTo(1.5 / 0.9, 4);
  });

  test('scales with height: the same masses over a longer frame are thinner', () => {
    const short = seg(buildBodyModel(metrics, 160).segments, 'left_leg');
    const tall = seg(buildBodyModel(metrics, 190).segments, 'left_leg');

    expect(Math.max(...tall.outer)).toBeLessThan(Math.max(...short.outer));
    // Volume is conserved regardless of frame.
    expect(volumeOf(tall.outer, tall.length)).toBeCloseTo(
      volumeOf(short.outer, short.length),
      4,
    );
  });

  test('elliptical cross-sections preserve the measured volume exactly', () => {
    const { segments } = buildBodyModel(metrics, 175);
    for (const seg of segments.filter((x) => x.measured)) {
      // a·b = r² is what keeps the ellipse holding the circle's volume.
      expect((seg.scaleX ?? 1) * (seg.scaleZ ?? 1)).toBeCloseTo(1, 10);
    }
  });

  test('the torso is wider than it is deep', () => {
    const trunk = seg(buildBodyModel(metrics, 175).segments, 'trunk');
    expect(trunk.scaleX!).toBeGreaterThan(1);
    expect(trunk.scaleZ!).toBeLessThan(1);
  });

  test('arms abduct away from the torso on both sides', () => {
    const { segments } = buildBodyModel(metrics, 175);
    expect(seg(segments, 'left_arm').rotationZ!).toBeGreaterThan(0);
    expect(seg(segments, 'right_arm').rotationZ!).toBeLessThan(0);
  });

  test('places the left side on +x, so a front-facing figure reads anatomically', () => {
    const { segments } = buildBodyModel(metrics, 175);
    // Facing the front camera at +z, the figure's left is on the viewer's right.
    expect(seg(segments, 'left_arm').origin[0]).toBeGreaterThan(0);
    expect(seg(segments, 'right_arm').origin[0]).toBeLessThan(0);
    expect(seg(segments, 'left_leg').origin[0]).toBeGreaterThan(0);
    expect(seg(segments, 'right_leg').origin[0]).toBeLessThan(0);
  });

  test('limbs meet the torso they were computed against', () => {
    const { segments } = buildBodyModel(metrics, 175);
    const trunk = seg(segments, 'trunk');
    const arm = seg(segments, 'left_arm');
    const leg = seg(segments, 'left_leg');

    // Arm overlaps the shoulder rather than floating beside it.
    expect(Math.abs(arm.origin[0]) - arm.outer[0]).toBeLessThan(trunk.outer[0]);
    // Legs sit under the hips, not outside them.
    expect(Math.abs(leg.origin[0]) + leg.outer[0]).toBeLessThanOrEqual(
      trunk.outer.at(-1)! * 1.35,
    );
  });

  test('missing or zero mass degrades to zero rather than NaN', () => {
    const { segments } = buildBodyModel({ weight: 60, fat_percentage: 25 }, 170);
    for (const s of segments) {
      for (const r of [...s.outer, ...s.muscle]) {
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

const describeIf = (n: string) => (has(n) ? describe : describe.skip);

describeIf('report-a.pdf')('real report A', () => {
  test('measured segments cover a plausible share of body volume', async () => {
    const { model } = await modelFor('report-a.pdf');
    expect(model.coverage).toBeGreaterThan(0.85);
    expect(model.coverage).toBeLessThan(0.97);
  });

  test('trunk circumference lands in a realistic range', async () => {
    const { model } = await modelFor('report-a.pdf');
    const trunk = seg(model.segments, 'trunk');
    const meanRadius = trunk.outer.reduce((a, b) => a + b, 0) / trunk.outer.length;
    const circumference = 2 * Math.PI * meanRadius * 100;
    expect(circumference).toBeGreaterThan(60);
    expect(circumference).toBeLessThan(110);
  });

  test('measured left/right difference shows up in the geometry', async () => {
    const { model, metrics } = await modelFor('report-a.pdf');
    // The report gives 5.5 kg left leg muscle against 5.2 kg right.
    expect(metrics.left_leg_muscle_mass).toBeGreaterThan(metrics.right_leg_muscle_mass);

    const left = seg(model.segments, 'left_leg');
    const right = seg(model.segments, 'right_leg');
    expect(Math.max(...left.outer)).toBeGreaterThan(Math.max(...right.outer));
    expect(model.asymmetry.legs).toBeGreaterThan(0);
  });

  test('unmeasured regions carry no mass', async () => {
    const { model } = await modelFor('report-a.pdf');
    for (const s of model.segments.filter((x) => !x.measured)) {
      expect(s.mass.lean).toBe(0);
      expect(s.mass.fat).toBe(0);
      expect(s.volumeL).toBe(0);
    }
  });
});

describeIf('report-b.pdf')('real report B', () => {
  test('covers a plausible share of body volume', async () => {
    const { model } = await modelFor('report-b.pdf');
    expect(model.coverage).toBeGreaterThan(0.85);
    expect(model.coverage).toBeLessThan(0.97);
  });

  test('produces a visibly different body from report A', async () => {
    const a = await modelFor('report-a.pdf');
    const b = await modelFor('report-b.pdf');

    const trunkA = Math.max(...seg(a.model.segments, 'trunk').outer);
    const trunkB = Math.max(...seg(b.model.segments, 'trunk').outer);
    expect(Math.abs(trunkA - trunkB)).toBeGreaterThan(0.005);

    // B carries far more leg muscle, and the geometry should say so.
    const legA = seg(a.model.segments, 'left_leg');
    const legB = seg(b.model.segments, 'left_leg');
    expect(legB.muscleShare).toBeGreaterThan(legA.muscleShare);
  });
});
