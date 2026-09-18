import { describe, test, expect } from 'vitest';
import { deurenbergBodyFat, detailLevel, metricsFromAnswers, type BuildAnswers } from '../src/lib/selfReport';
import { effectiveProvenance, provenanceFor, CATALOG } from '../src/lib/catalog';
import { runDataCheck } from '../src/lib/dataCheck';
import { buildBodyModel, type MetricValues } from '../src/lib/bodyModel';
import { FORBIDDEN_PHRASES, KNOWLEDGE } from '../src/lib/knowledge';
import { BUILD_COPY } from '../src/ui/buildCopy';

const level1: BuildAnswers = { name: 'Sam', sex: 'male', age: 40, height_cm: 175, weight_kg: 80 };

describe('Deurenberg body fat', () => {
  test('reproduces the published equation for BMI 25 at age 40', () => {
    expect(deurenbergBodyFat(25, 40, 'male')).toBeCloseTo(1.2 * 25 + 0.23 * 40 - 10.8 - 5.4, 6);
    expect(deurenbergBodyFat(25, 40, 'female')).toBeCloseTo(1.2 * 25 + 0.23 * 40 - 5.4, 6);
  });

  test('a neutral sex sits halfway, and extremes are clamped', () => {
    const f = deurenbergBodyFat(25, 40, 'female'), m = deurenbergBodyFat(25, 40, 'male');
    expect(deurenbergBodyFat(25, 40, 'other')).toBeCloseTo((f + m) / 2, 6);
    expect(deurenbergBodyFat(12, 18, 'male')).toBe(3);
    expect(deurenbergBodyFat(60, 90, 'female')).toBe(60);
  });
});

describe('metrics from answers', () => {
  test('level 1 yields weight (self-reported), BMI (derived) and an estimated body fat with its masses', () => {
    const { metrics, parsed } = metricsFromAnswers(level1);
    const by = new Map(metrics.map((m) => [m.canonical_name, m]));
    expect(by.get('weight')!.provenance).toBe('self_reported');
    expect(by.get('bmi')!.provenance).toBe('derived');
    expect(by.get('bmi')!.value).toBeCloseTo(26.1, 1);
    expect(by.get('fat_percentage')!.provenance).toBe('estimated');
    expect(by.get('fat_mass')!.provenance).toBe('estimated');
    expect(by.get('lean_mass')!.provenance).toBe('estimated');
    expect(by.get('fat_mass')!.value + by.get('lean_mass')!.value).toBeCloseTo(80, 1);
    expect(parsed.provider).toBe('Self-reported');
    expect(parsed.sex).toBe('Male');
    expect(parsed.height_cm_derived).toBe(175);
    expect(detailLevel(level1)).toBe(1);
  });

  test('an entered body fat replaces the estimate and its masses become derived', () => {
    const { metrics } = metricsFromAnswers({ ...level1, fat_percentage: 22 });
    const by = new Map(metrics.map((m) => [m.canonical_name, m]));
    expect(by.get('fat_percentage')!.value).toBe(22);
    expect(by.get('fat_percentage')!.provenance).toBe('self_reported');
    expect(by.get('fat_mass')!.provenance).toBe('derived');
    expect(by.get('fat_mass')!.value).toBeCloseTo(17.6, 1);
  });

  test('tape values are rows of their own and no regional mass is ever invented', () => {
    const a: BuildAnswers = { ...level1, waist_cm: 88, hip_cm: 100, left_thigh_cm: 56.4 };
    const { metrics } = metricsFromAnswers(a);
    const names = metrics.map((m) => m.canonical_name);
    expect(names).toContain('waist_circumference');
    expect(names).toContain('left_thigh_circumference');
    expect(names.some((n) => /_muscle_mass|_fat_mass|skeletal/.test(n))).toBe(false);
    expect(detailLevel(a)).toBe(3);
    for (const m of metrics) expect(CATALOG.some((c) => c.canonical_name === m.canonical_name), m.canonical_name).toBe(true);
  });

  test('the data check has nothing to say about a consistent self-report', () => {
    const { metrics } = metricsFromAnswers({ ...level1, fat_percentage: 22, waist_cm: 88 });
    const flags = runDataCheck(
      metrics.map((m) => ({ canonical_name: m.canonical_name, display_name: m.display_name, value: m.value, unit: m.unit, source_classification: null })),
    );
    expect(flags).toEqual([]);
  });

  test('the body model treats a self-report as having no measured regions, but a whole-body volume', () => {
    const { metrics } = metricsFromAnswers(level1);
    const values: MetricValues = {};
    for (const m of metrics) values[m.canonical_name] = m.value;
    const model = buildBodyModel(values, 175);
    expect(model.segments.every((s) => !s.measured)).toBe(true);
    expect(model.totalBodyVolumeL).toBeGreaterThan(70);
  });
});

describe('provenance precedence', () => {
  test('typed and estimated rows keep their tag; everything else defers to the catalog', () => {
    expect(effectiveProvenance({ canonical_name: 'fat_percentage', provenance: 'estimated' })).toBe('estimated');
    expect(effectiveProvenance({ canonical_name: 'weight', provenance: 'self_reported' })).toBe('self_reported');
    expect(effectiveProvenance({ canonical_name: 'bmi', provenance: 'measured' })).toBe(provenanceFor('bmi'));
    expect(provenanceFor('bmi')).toBe('derived');
  });
});

describe('questionnaire copy obeys the guardrails', () => {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(BUILD_COPY);

  test('no string uses a forbidden phrase', () => {
    expect(strings.length).toBeGreaterThan(20);
    for (const s of strings) for (const p of FORBIDDEN_PHRASES) expect(s.toLowerCase(), `"${p}" in "${s}"`).not.toContain(p);
  });

  test('the estimate is always named for what it is', () => {
    expect(BUILD_COPY.metricNotes.estimated).toMatch(/Deurenberg/);
    expect(BUILD_COPY.metricNotes.estimated).toMatch(/not a measurement/);
  });

  test('tape metrics have knowledge entries with context and no judgement', () => {
    for (const n of ['waist_circumference', 'hip_circumference', 'left_thigh_circumference']) {
      const k = KNOWLEDGE[n];
      expect(k, n).toBeTruthy();
      expect(k.what_could_add_context.length).toBeGreaterThan(0);
    }
  });
});
