/**
 * "Build My Body": answers typed by the person become the same metric rows and the
 * same body fit a report would produce. Every row is tagged for what it is — typed by
 * the person, or computed from what they typed by a formula that is named — and no
 * regional mass is ever invented: tape measurements shape the figure directly.
 */
import { BY_NAME, type Provenance } from './catalog';
import type { ParsedMetric, ParsedReport } from './parser';

export type Sex = 'female' | 'male' | 'other';

export interface BuildAnswers {
  name: string;
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  // Level 2
  fat_percentage?: number;
  waist_cm?: number;
  hip_cm?: number;
  // Level 3
  chest_cm?: number;
  left_upper_arm_cm?: number;
  right_upper_arm_cm?: number;
  left_thigh_cm?: number;
  right_thigh_cm?: number;
  skin_tone?: string;
}

export const PROVIDER_SELF = 'Self-reported';

/** Deurenberg, van der Kooy, Seidell et al. 1991, Br J Nutr 65:105–114. Adults. */
export const DEURENBERG = {
  name: 'Deurenberg (1991)',
  formula: 'body fat % = 1.20 × BMI + 0.23 × age − 10.8 × sex − 5.4, where sex is 1 for male and 0 for female',
};

export function deurenbergBodyFat(bmi: number, age: number, sex: Sex): number {
  const s = sex === 'male' ? 1 : sex === 'female' ? 0 : 0.5;
  const bf = 1.2 * bmi + 0.23 * age - 10.8 * s - 5.4;
  return Math.min(60, Math.max(3, bf));
}

export interface SelfMetric {
  canonical_name: string;
  display_name: string;
  value: number;
  unit: string | null;
  provenance: Provenance;
}

/** Input sanity only; these are ranges the form accepts, never a judgement about a body. */
export const RANGES = {
  age: [18, 100],
  height_cm: [120, 230],
  weight_kg: [30, 300],
  fat_percentage: [3, 60],
  circumference_cm: [20, 200],
} as const;

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function detailLevel(a: BuildAnswers): 1 | 2 | 3 {
  if ([a.chest_cm, a.left_upper_arm_cm, a.right_upper_arm_cm, a.left_thigh_cm, a.right_thigh_cm].some((v) => v != null)) return 3;
  if ([a.fat_percentage, a.waist_cm, a.hip_cm].some((v) => v != null)) return 2;
  return 1;
}

export function metricsFromAnswers(a: BuildAnswers): { metrics: SelfMetric[]; parsed: ParsedReport } {
  const rows: SelfMetric[] = [];
  const add = (canonical_name: string, value: number, provenance: Provenance) => {
    const entry = BY_NAME.get(canonical_name);
    if (!entry) throw new Error(`unknown metric ${canonical_name}`);
    rows.push({ canonical_name, display_name: entry.display_name, value, unit: entry.unit, provenance });
  };

  const heightM = a.height_cm / 100;
  const bmi = round(a.weight_kg / (heightM * heightM));
  add('weight', round(a.weight_kg), 'self_reported');
  add('bmi', bmi, 'derived');

  const fatEntered = a.fat_percentage != null;
  const fatPct = fatEntered ? round(a.fat_percentage!) : round(deurenbergBodyFat(bmi, a.age, a.sex));
  add('fat_percentage', fatPct, fatEntered ? 'self_reported' : 'estimated');
  const fatMass = round((a.weight_kg * fatPct) / 100);
  add('fat_mass', fatMass, fatEntered ? 'derived' : 'estimated');
  add('lean_mass', round(a.weight_kg - fatMass), fatEntered ? 'derived' : 'estimated');

  const tape: [string, number | undefined][] = [
    ['waist_circumference', a.waist_cm],
    ['hip_circumference', a.hip_cm],
    ['chest_circumference', a.chest_cm],
    ['left_upper_arm_circumference', a.left_upper_arm_cm],
    ['right_upper_arm_circumference', a.right_upper_arm_cm],
    ['left_thigh_circumference', a.left_thigh_cm],
    ['right_thigh_circumference', a.right_thigh_cm],
  ];
  for (const [name, v] of tape) if (v != null) add(name, round(v), 'self_reported');

  const parsedMetrics: ParsedMetric[] = rows.map((r) => ({
    canonical_name: r.canonical_name,
    label: BY_NAME.get(r.canonical_name)!.label,
    display_name: r.display_name,
    value: r.value,
    unit: r.unit,
    source_classification: null,
    source_page: 0,
    category: BY_NAME.get(r.canonical_name)!.category,
    confidence: 'high',
  }));

  const parsed: ParsedReport = {
    provider: PROVIDER_SELF,
    subject_name: a.name.trim() || null,
    age: a.age,
    sex: a.sex === 'female' ? 'Female' : a.sex === 'male' ? 'Male' : null,
    measurement_date: new Date().toISOString().slice(0, 10),
    height_cm_derived: a.height_cm,
    metrics: parsedMetrics,
    unmapped: [],
    narrative: { summary: '', critical_findings: '', recommendations: [] },
  };

  return { metrics: rows, parsed };
}
