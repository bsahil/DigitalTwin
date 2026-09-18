import { readFileSync, existsSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { parsePdf } from '../src/lib/parser';
import { buildBodyModel, type MetricValues } from '../src/lib/bodyModel';
import { HumanMesh } from '../src/lib/humanMesh';
import { fitBody, fitInputFromModel, macroWeights, type FitInput } from '../src/lib/bodyFit';
import { FORBIDDEN_PHRASES } from '../src/lib/knowledge';
import { loadAsset } from './humanAsset.test';

const fixture = (n: string) => new URL(`./fixtures/${n}`, import.meta.url);
const has = (n: string) => existsSync(fixture(n));
const describeIf = (n: string) => (has(n) ? describe : describe.skip);

const mesh = new HumanMesh(loadAsset());

async function fitFixture(file: string) {
  const buf = readFileSync(fixture(file));
  const parsed = await parsePdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const values: MetricValues = {};
  for (const m of parsed.metrics) if (typeof m.value === 'number') values[m.canonical_name] = m.value;
  const model = buildBodyModel(values, parsed.height_cm_derived!);
  const input = fitInputFromModel(model, { sex: parsed.sex, age: parsed.age }, values);
  return { parsed, values, model, input, fit: fitBody(mesh, input) };
}

describe('macro weights', () => {
  test('gender and age split the macro targets, size and muscle pick a side of average', () => {
    const w = macroWeights({ gender: 0.25, age: 0.2, size: 0.75, muscle: 0.3 });
    expect(w['macro-female-young']).toBeCloseTo(0.75 * 0.8);
    expect(w['macro-female-old']).toBeCloseTo(0.75 * 0.2);
    expect(w['macro-male-young']).toBeCloseTo(0.25 * 0.8);
    expect(w['weight-female-max']).toBeCloseTo(0.75 * 0.5);
    expect(w['weight-female-min']).toBeUndefined();
    expect(w['muscle-male-min']).toBeCloseTo(0.25 * 0.4);
    expect(w['muscle-male-max']).toBeUndefined();
  });

  test('the average body has no size or muscle deltas at all', () => {
    const w = macroWeights({ gender: 1, age: 0, size: 0.5, muscle: 0.5 });
    expect(Object.keys(w).filter((k) => !k.startsWith('macro-'))).toEqual([]);
  });
});

describeIf('report-a.pdf')('fitting report A', () => {
  test('lands every measured region on the volume its masses imply', async () => {
    const { input, fit } = await fitFixture('report-a.pdf');
    for (const [id, want] of Object.entries(input.regions)) {
      expect(Math.abs(fit.achieved.volumesL[id] - want!.volumeL) / want!.volumeL, id).toBeLessThan(0.015);
    }
    expect(fit.fitted).toHaveLength(5);
  });

  test('whole-body volume is within 3 % of what weight and body fat imply', async () => {
    const { input, fit } = await fitFixture('report-a.pdf');
    expect(Math.abs(fit.achieved.volumesL.total - input.totalVolumeL!) / input.totalVolumeL!).toBeLessThan(0.03);
  });

  test('keeps the measured left/right ordering of the legs', async () => {
    const { values, fit } = await fitFixture('report-a.pdf');
    expect(values.left_leg_muscle_mass).toBeGreaterThan(values.right_leg_muscle_mass);
    expect(fit.achieved.volumesL.left_leg).toBeGreaterThan(fit.achieved.volumesL.right_leg);
  });

  test('is female, finite, bounded and deterministic', async () => {
    const { input, fit } = await fitFixture('report-a.pdf');
    expect(input.gender).toBe(0);
    for (const [k, v] of Object.entries(fit.weights)) {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(1);
    }
    const again = fitBody(mesh, input);
    expect(again.weights).toEqual(fit.weights);
  });

  test('says what was fitted and what is template, in the product’s own vocabulary', async () => {
    const { fit } = await fitFixture('report-a.pdf');
    const levels = fit.claims.map((c) => c.level);
    expect(levels).toContain('derived');
    expect(levels).toContain('illustrative');
    for (const c of fit.claims) {
      for (const phrase of FORBIDDEN_PHRASES) expect(c.text.toLowerCase(), phrase).not.toContain(phrase);
    }
    expect(fit.claims.some((c) => /template/.test(c.text))).toBe(true);
  });
});

describeIf('report-b.pdf')('fitting report B', () => {
  test('a heavier male report gives a larger body with every region on target', async () => {
    const { input, fit } = await fitFixture('report-b.pdf');
    expect(input.gender).toBe(1);
    for (const [id, want] of Object.entries(input.regions)) {
      expect(Math.abs(fit.achieved.volumesL[id] - want!.volumeL) / want!.volumeL, id).toBeLessThan(0.015);
    }
    expect(fit.achieved.volumesL.total).toBeGreaterThan(60);
  });
});

describe('fitting questionnaire answers', () => {
  const level1: FitInput = {
    gender: 1,
    age: 40,
    heightM: 1.75,
    totalVolumeL: buildBodyModel({ weight: 80, fat_percentage: 24 }, 175).totalBodyVolumeL,
    fatVolumeFraction: (80 * 0.24) / 0.9 / buildBodyModel({ weight: 80, fat_percentage: 24 }, 175).totalBodyVolumeL,
    muscleFraction: null,
    regions: {},
    circumferencesM: {},
    source: 'self_report',
  };

  test('level 1 hits the whole-body volume from weight and an estimated body fat', () => {
    const fit = fitBody(mesh, level1);
    expect(level1.totalVolumeL).toBeGreaterThan(70);
    expect(Math.abs(fit.achieved.volumesL.total - level1.totalVolumeL!) / level1.totalVolumeL!).toBeLessThan(0.01);
    expect(fit.fitted).toEqual([]);
    expect(fit.claims.some((c) => c.level === 'estimated')).toBe(true);
  });

  test('a bigger hip measurement widens the hip slice by at least what was asked', () => {
    const small = fitBody(mesh, { ...level1, circumferencesM: { hip: 1.02 } });
    const big = fitBody(mesh, { ...level1, circumferencesM: { hip: 1.14 } });
    expect(Math.abs(small.achieved.circumferencesM.hip - 1.02)).toBeLessThan(0.02);
    expect(Math.abs(big.achieved.circumferencesM.hip - 1.14)).toBeLessThan(0.02);
    expect(big.achieved.circumferencesM.hip - small.achieved.circumferencesM.hip).toBeGreaterThan(0.1);
    // The whole-body volume is kept while the hip changes: the difference goes elsewhere.
    for (const f of [small, big]) expect(Math.abs(f.achieved.volumesL.total - level1.totalVolumeL!) / level1.totalVolumeL!).toBeLessThan(0.03);
    expect(big.claims.some((c) => c.level === 'self_reported' && /Hip drawn at 114\.\d cm, as you entered/.test(c.text))).toBe(true);
    const unreachable = fitBody(mesh, { ...level1, circumferencesM: { hip: 0.8 } });
    expect(unreachable.claims.some((c) => /you entered 80\.0 cm; this body shape reaches/.test(c.text))).toBe(true);
  });

  test('a neutral sex is a blend and is disclosed', () => {
    const fit = fitBody(mesh, { ...level1, gender: 0.5 });
    expect(fit.weights['macro-female-young']).toBeCloseTo(0.5 * (1 - fit.params.age));
    expect(fit.claims.some((c) => /neutral blend/.test(c.text))).toBe(true);
  });
});
