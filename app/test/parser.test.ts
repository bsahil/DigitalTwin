import { readFileSync, existsSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { parsePdf, type ParsedReport } from '../src/lib/parser';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

async function load(name: string): Promise<ParsedReport> {
  const buf = readFileSync(fixture(name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return parsePdf(ab);
}

const has = (name: string) => existsSync(fixture(name));

/** [canonical_name, value, unit, source_classification] — verified against the real file. */
type Row = [string, number | string, string | null, string | null];

const REPORT_A: Row[] = [
  ['weight', 54.3, 'kg', 'Normal'],
  ['bmi', 19.9, null, 'Normal'],
  ['fat_mass', 19.3, 'kg', 'Normal'],
  ['fat_percentage', 35.6, '%', 'High'],
  ['skeletal_muscle_mass', 18.2, 'kg', 'Lean'],
  ['skeletal_muscle_percentage', 33.5, '%', 'Normal'],
  ['lean_mass', 34.9, 'kg', 'Healthy'],
  ['lean_mass_percentage', 59.7, '%', 'Average'],
  ['total_water', 25.6, 'kg', 'Low'],
  ['water_percentage', 47.2, '%', 'Low'],
  ['health_score', 65.0, 'points', null],
  ['body_health_status', 'Unhealthy Signs', null, null],
  ['body_age', 24.0, 'years', null],
  ['body_type', 'High Body Fat', null, null],
  ['body_symmetry', 100.4, null, null],
  ['t_score', 1.4, null, 'Normal'],
  ['z_score', 0.9, null, null],
  ['subcutaneous_fat_mass', 17.0, 'kg', 'Normal'],
  ['subcutaneous_fat_percentage', 31.3, '%', 'Overweight'],
  ['visceral_fat_mass', 2.3, 'kg', 'High'],
  ['visceral_fat_level', 8.0, null, 'Low'],
  ['trunk_fat_mass', 9.8, 'kg', 'Overweight'],
  ['left_arm_fat_mass', 1.0, 'kg', 'Low'],
  ['right_arm_fat_mass', 1.1, 'kg', 'Low'],
  ['left_leg_fat_mass', 2.5, 'kg', 'Normal'],
  ['right_leg_fat_mass', 2.6, 'kg', 'Normal'],
  ['fat_control', -6.1, 'kg', null],
  ['fat_grade', 'Healthy', null, null],
  ['left_arm_muscle_fat_ratio', 1.7, null, 'Low'],
  ['left_leg_muscle_fat_ratio', 2.2, null, 'Normal'],
  ['right_arm_muscle_fat_ratio', 1.5, null, 'Low'],
  ['right_leg_muscle_fat_ratio', 2.0, null, 'Low'],
  ['trunk_muscle_fat_ratio', 1.6, null, 'Low'],
  ['muscle_control', 9.1, 'kg', 'Low'],
  ['left_arm_muscle_mass', 1.7, 'kg', 'Lean'],
  ['right_arm_muscle_mass', 1.6, 'kg', 'Lean'],
  ['left_leg_muscle_mass', 5.5, 'kg', 'Healthy'],
  ['right_leg_muscle_mass', 5.2, 'kg', 'Healthy'],
  ['trunk_muscle_mass', 15.5, 'kg', 'Lean'],
  ['upper_lower_muscle_balance', 1.8, null, 'Balanced'],
  ['trunk_limb_muscle_balance', 1.1, null, 'Balanced'],
  ['intracellular_water', 16.0, 'kg', 'Low'],
  ['extracellular_water', 9.5, 'kg', 'Low'],
  ['water_balance', 1.7, null, 'Low'],
  ['protein_mass', 6.8, 'kg', 'Low'],
  ['protein_percentage', 12.5, '%', 'Low'],
  ['bone_mass', 2.0, 'kg', 'Low'],
  ['mineral', 2.5, 'kg', null],
  ['body_cell_mass', 22.9, 'kg', 'Normal'],
  ['heart_rate', 94.0, 'bpm', 'High'],
  ['bmr', 1123.0, 'kcal', 'Very Low'],
  ['recommended_calorie_intake', 1459.0, 'kcal', null],
  ['ideal_weight', 57.2, 'kg', null],
  ['weight_control', 3.0, 'kg', null],
  ['fat_free_mass', 34.9, 'kg', 'Low'],
];

const REPORT_B_SPOT: Row[] = [
  ['weight', 73.0, 'kg', 'Normal'],
  ['bmi', 23.0, null, 'Normal'],
  ['fat_mass', 13.6, 'kg', 'Normal'],
  ['fat_percentage', 18.6, '%', 'Normal'],
  ['lean_mass', 59.4, 'kg', 'Athletic'],
  ['fat_free_mass', 59.4, 'kg', 'Low'],
  ['body_type', 'Balanced Build', null, null],
  ['body_health_status', 'Moderate health', null, null],
  ['body_symmetry', 96.7, null, 'Symmetric'],
  ['trunk_limb_muscle_balance', 1.0, null, 'Mild Asymmetry'],
  ['weight_control', -3.1, 'kg', null],
  ['heart_rate', 107.0, 'bpm', 'High'],
  ['protein_percentage', 16.1, '%', null],
  ['visceral_fat_level', 6.0, null, 'Low'],
];

const describeIf = (name: string) => (has(name) ? describe : describe.skip);

describeIf('report-a.pdf')('Report A — g, 26, Female', () => {
  test('extracts all 55 metrics with exact values, units and classifications', async () => {
    const r = await load('report-a.pdf');
    expect(r.metrics).toHaveLength(55);

    for (const [name, value, unit, status] of REPORT_A) {
      const m = r.metrics.find((x) => x.canonical_name === name);
      expect(m, `missing metric: ${name}`).toBeDefined();
      expect([name, m!.value], `value of ${name}`).toEqual([name, value]);
      expect([name, m!.unit], `unit of ${name}`).toEqual([name, unit]);
      expect([name, m!.source_classification], `status of ${name}`).toEqual([name, status]);
    }
  });

  test('parses the letter-spaced page 1 header', async () => {
    const r = await load('report-a.pdf');
    expect(r.subject_name).toBe('g');
    expect(r.age).toBe(26);
    expect(r.sex).toBe('Female');
    expect(r.measurement_date).toBe('2026-03-28');
    expect(r.provider).toBe('FITTR');
  });

  test('derives height from weight and BMI', async () => {
    const r = await load('report-a.pdf');
    expect(r.height_cm_derived).toBeCloseTo(165.2, 1);
  });

  test('preserves the source contradictions rather than resolving them', async () => {
    const r = await load('report-a.pdf');
    const get = (n: string) => r.metrics.find((m) => m.canonical_name === n)!;

    // Identical value, contradictory classifications.
    expect(get('lean_mass').value).toBe(get('fat_free_mass').value);
    expect(get('lean_mass').source_classification).toBe('Healthy');
    expect(get('fat_free_mass').source_classification).toBe('Low');

    expect(get('visceral_fat_mass').source_classification).toBe('High');
    expect(get('visceral_fat_level').source_classification).toBe('Low');
  });

  test('keeps negative values signed', async () => {
    const r = await load('report-a.pdf');
    expect(r.metrics.find((m) => m.canonical_name === 'fat_control')!.value).toBe(-6.1);
  });

  test('finds no unmapped rows in a fully mapped report', async () => {
    const r = await load('report-a.pdf');
    expect(r.unmapped).toEqual([]);
  });
});

describeIf('report-b.pdf')('Report B — Sahil, 27, Male', () => {
  test('extracts 54 metrics and omits the one the report does not contain', async () => {
    const r = await load('report-b.pdf');
    expect(r.metrics).toHaveLength(54);
    expect(r.metrics.find((m) => m.canonical_name === 'muscle_control')).toBeUndefined();
  });

  test('extracts spot-checked values including multi-word statuses', async () => {
    const r = await load('report-b.pdf');
    for (const [name, value, unit, status] of REPORT_B_SPOT) {
      const m = r.metrics.find((x) => x.canonical_name === name);
      expect(m, `missing metric: ${name}`).toBeDefined();
      expect([name, m!.value], `value of ${name}`).toEqual([name, value]);
      expect([name, m!.unit], `unit of ${name}`).toEqual([name, unit]);
      expect([name, m!.source_classification], `status of ${name}`).toEqual([name, status]);
    }
  });

  test('parses a different subject', async () => {
    const r = await load('report-b.pdf');
    expect(r.subject_name).toBe('Sahil');
    expect(r.age).toBe(27);
    expect(r.sex).toBe('Male');
    expect(r.height_cm_derived).toBeCloseTo(178.2, 1);
  });
});
