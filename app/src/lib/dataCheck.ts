/**
 * Data Check — surfaces places where a report disagrees with itself.
 *
 * Every rule is explicit and static. Nothing here resolves a conflict, corrects a value,
 * or picks a winner: both readings are shown exactly as the report gives them.
 */

import { DERIVED_FROM, provenanceFor } from './catalog';

export interface CheckMetric {
  canonical_name: string;
  display_name: string;
  value: number | string;
  unit: string | null;
  source_classification: string | null;
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

export interface Flag {
  id: string;
  rule: RuleId;
  title: string;
  body: string;
  metrics: CheckMetric[];
  /** `source` = the report disagrees with itself. `extraction` = the parse may be wrong. */
  origin: 'source' | 'extraction';
}

/** Classification words grouped by what they signal, so "Normal" vs "Healthy" is not a conflict. */
const TIERS: Record<string, string> = {
  normal: 'steady',
  healthy: 'steady',
  balanced: 'steady',
  symmetric: 'steady',
  standard: 'steady',
  average: 'steady',
  athletic: 'steady',
  low: 'below',
  'very low': 'below',
  lean: 'below',
  high: 'above',
  'very high': 'above',
  overweight: 'above',
  obese: 'above',
  'mild asymmetry': 'uneven',
};

const tierOf = (label: string | null): string | null =>
  label ? (TIERS[label.trim().toLowerCase()] ?? 'unknown') : null;

const comparable = (t: string | null): t is string => t !== null && t !== 'unknown';

/**
 * The provider's word for a metric. Usually the classification cell; for a categorical
 * metric such as fat grade the word sits in the value cell instead. A value counts only
 * when it is verbatim a scale word — a summary verdict like "Unhealthy Signs" is not a
 * position on a scale and must not be forced onto one.
 */
const labelOf = (m: CheckMetric): string | null => {
  if (m.source_classification) return m.source_classification;
  if (typeof m.value === 'string' && m.value.trim().toLowerCase() in TIERS) return m.value.trim();
  return null;
};

/** Two derived figures computed from the same inputs cannot disagree on their own account. */
const sameDerivation = (a: string, b: string) => {
  if (provenanceFor(a) !== 'derived' || provenanceFor(b) !== 'derived') return false;
  const sa = [...(DERIVED_FROM[a] ?? [])].sort().join('|');
  const sb = [...(DERIVED_FROM[b] ?? [])].sort().join('|');
  return sa.length > 0 && sa === sb;
};

const get = (metrics: CheckMetric[], name: string) =>
  metrics.find((m) => m.canonical_name === name);

const num = (m: CheckMetric | undefined): number | null =>
  m && typeof m.value === 'number' ? m.value : null;

/** Pairs that describe the same tissue or the same quantity on two scales. */
const RELATED_PAIRS: { a: string; b: string; note: string }[] = [
  {
    a: 'lean_mass',
    b: 'fat_free_mass',
    note: 'These often describe the same tissue, and in this report they carry the same value.',
  },
  {
    a: 'visceral_fat_mass',
    b: 'visceral_fat_level',
    note: 'One is a mass in kilograms and the other is an index on the provider’s own scale.',
  },
  {
    a: 'fat_mass',
    b: 'fat_percentage',
    note: 'The same fat, expressed once as a weight and once as a share of body weight.',
  },
  {
    a: 'subcutaneous_fat_mass',
    b: 'subcutaneous_fat_percentage',
    note: 'The same compartment, expressed as a weight and as a share.',
  },
  {
    a: 'skeletal_muscle_mass',
    b: 'skeletal_muscle_percentage',
    note: 'The same muscle, expressed as a weight and as a share.',
  },
  {
    a: 'total_water',
    b: 'water_percentage',
    note: 'The same body water, expressed as a weight and as a share.',
  },
  {
    a: 'protein_mass',
    b: 'body_cell_mass',
    note: 'Both are components of lean tissue and usually move together.',
  },
  {
    a: 'lean_mass',
    b: 'lean_mass_percentage',
    note: 'The same lean tissue, expressed as a weight and as a share.',
  },
  {
    a: 'protein_mass',
    b: 'protein_percentage',
    note: 'The same protein, expressed as a weight and as a share.',
  },
  {
    a: 't_score',
    b: 'z_score',
    note: 'The same bone measurement compared against two different reference groups.',
  },
  {
    a: 'bone_mass',
    b: 'mineral',
    note: 'Overlapping quantities — most of the body’s mineral content is bone.',
  },
  {
    a: 'health_score',
    b: 'body_health_status',
    note: 'The provider’s summary of this scan, once as a number and once as a word.',
  },
  {
    a: 'fat_grade',
    b: 'fat_percentage',
    note: 'A provider label summarising the fat measurements it sits beside.',
  },
  {
    a: 'body_symmetry',
    b: 'upper_lower_muscle_balance',
    note: 'Two provider summaries of how evenly muscle is distributed.',
  },
  {
    a: 'body_symmetry',
    b: 'trunk_limb_muscle_balance',
    note: 'Two provider summaries of how evenly muscle is distributed.',
  },
  ...(['arm', 'leg'] as const).flatMap((limb) =>
    (['muscle_mass', 'fat_mass', 'muscle_fat_ratio'] as const).map((q) => ({
      a: `left_${limb}_${q}`,
      b: `right_${limb}_${q}`,
      note: 'The same measurement on the left and right sides.',
    })),
  ),
];

/** Claims in the report's prose that can be checked against its own tables. */
const CLAIM_PATTERNS = [
  /within (?:the )?normal range/i,
  /within (?:a |the )?healthy range/i,
  /is normal/i,
  /no significant/i,
];

const PROSE_KEYWORDS: { phrase: RegExp; metric: string }[] = [
  { phrase: /visceral fat level/i, metric: 'visceral_fat_level' },
  { phrase: /visceral fat/i, metric: 'visceral_fat_mass' },
  { phrase: /(?:body )?water percentage/i, metric: 'water_percentage' },
  { phrase: /body fat percentage/i, metric: 'fat_percentage' },
  { phrase: /\bBMI\b/, metric: 'bmi' },
  { phrase: /muscle mass/i, metric: 'skeletal_muscle_mass' },
];

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

export function runDataCheck(
  metrics: CheckMetric[],
  narrative?: { summary: string; critical_findings: string; recommendations: string[] },
): Flag[] {
  const flags: Flag[] = [];

  // R1 — two readings of the same thing, classified differently.
  for (const { a, b, note } of RELATED_PAIRS) {
    const ma = get(metrics, a);
    const mb = get(metrics, b);
    if (!ma || !mb) continue;

    const la = labelOf(ma);
    const lb = labelOf(mb);
    const ta = tierOf(la);
    const tb = tierOf(lb);
    if (!comparable(ta) || !comparable(tb) || ta === tb) continue;
    if (sameDerivation(a, b)) continue;

    const identical = ma.value === mb.value;
    flags.push({
      id: `R1:${a}:${b}`,
      rule: 'R1',
      title: identical
        ? 'The same value carries two different classifications'
        : 'Two related measurements are classified differently',
      body: `${note} Your report classifies ${ma.display_name} as “${la}” and ${mb.display_name} as “${lb}”. Both are shown exactly as they appear in your report — these measurements may use different scales or definitions.`,
      metrics: [ma, mb],
      origin: 'source',
    });
  }

  // R2 — the report's prose says one thing, its tables say another. A report often
  // repeats the same claim in several places, so claims are collected per metric and
  // reported once with every quote attached.
  if (narrative) {
    const prose = [
      narrative.summary,
      narrative.critical_findings,
      ...narrative.recommendations,
    ].filter(Boolean);

    const claimsByMetric = new Map<string, string[]>();

    for (const block of prose) {
      for (const sentence of sentences(block)) {
        const claim = CLAIM_PATTERNS.find((p) => p.test(sentence));
        if (!claim) continue;

        const claimAt = sentence.search(claim);

        // Attribute the claim to the nearest metric named before it, so a sentence
        // mentioning two metrics does not tar both.
        let subject: { metric: string; at: number } | null = null;
        for (const { phrase, metric } of PROSE_KEYWORDS) {
          const at = sentence.search(phrase);
          if (at === -1 || at > claimAt) continue;
          if (!subject || at > subject.at) subject = { metric, at };
        }
        if (!subject) continue;

        const quotes = claimsByMetric.get(subject.metric) ?? [];
        const text = sentence.trim();
        if (!quotes.includes(text)) quotes.push(text);
        claimsByMetric.set(subject.metric, quotes);
      }
    }

    for (const [name, quotes] of claimsByMetric) {
      const m = get(metrics, name);
      const tier = tierOf(m?.source_classification ?? null);
      if (!m || !comparable(tier) || tier === 'steady') continue;

      const quoted = quotes.map((q) => `“${q}”`).join(' It also says: ');
      flags.push({
        id: `R2:${name}`,
        rule: 'R2',
        title: 'Your report’s summary and its measurements disagree',
        body: `Your report states: ${quoted} — while the measurement table classifies ${m.display_name} as “${m.source_classification}”. Both come from the same report and both are preserved here.`,
        metrics: [m],
        origin: 'source',
      });
    }
  }

  // R3 — BMI and body fat describe different things and can diverge.
  const bmi = get(metrics, 'bmi');
  const fatPct = get(metrics, 'fat_percentage');
  const tBmi = tierOf(bmi?.source_classification ?? null);
  const tFat = tierOf(fatPct?.source_classification ?? null);
  if (bmi && fatPct && comparable(tBmi) && comparable(tFat) && tBmi !== tFat) {
    flags.push({
      id: 'R3:bmi:fat_percentage',
      rule: 'R3',
      title: 'Your BMI and your body fat are classified differently',
      body: `BMI is your weight relative to your height and cannot tell fat from muscle. Body fat percentage measures composition directly. Your report classifies BMI as “${bmi.source_classification}” and body fat as “${fatPct.source_classification}”. Two measurements describing different things can reasonably land in different categories.`,
      metrics: [bmi, fatPct],
      origin: 'source',
    });
  }

  // R4 — the numbers do not add up.
  const share = (pct: string, mass: string, id: string, label: string) => ({
    id,
    label,
    stated: num(get(metrics, mass)),
    computed:
      num(get(metrics, pct)) !== null && num(get(metrics, 'weight')) !== null
        ? (num(get(metrics, pct))! * num(get(metrics, 'weight'))!) / 100
        : null,
    tolerance: 2,
    involved: [mass, pct, 'weight'],
  });

  // Ratios are printed to one decimal, so the tolerance is half a display unit, not a percentage.
  const ratio = (region: string, label: string) => ({
    id: `ratio_${region}`,
    label: `${label} muscle-to-fat ratio against its own muscle and fat`,
    stated: num(get(metrics, `${region}_muscle_fat_ratio`)),
    computed:
      num(get(metrics, `${region}_muscle_mass`)) !== null &&
      (num(get(metrics, `${region}_fat_mass`)) ?? 0) > 0
        ? num(get(metrics, `${region}_muscle_mass`))! / num(get(metrics, `${region}_fat_mass`))!
        : null,
    tolerance: 0,
    absolute: 0.06,
    involved: [`${region}_muscle_fat_ratio`, `${region}_muscle_mass`, `${region}_fat_mass`],
  });

  const arithmetic: {
    id: string;
    label: string;
    stated: number | null;
    computed: number | null;
    tolerance: number;
    absolute?: number;
    involved: string[];
  }[] = [
    share('skeletal_muscle_percentage', 'skeletal_muscle_mass', 'skm_percentage', 'skeletal muscle percentage against skeletal muscle mass'),
    share('water_percentage', 'total_water', 'water_percentage', 'body water percentage against total water'),
    share('subcutaneous_fat_percentage', 'subcutaneous_fat_mass', 'subcut_percentage', 'subcutaneous fat percentage against subcutaneous fat mass'),
    share('protein_percentage', 'protein_mass', 'protein_percentage', 'protein percentage against protein mass'),
    ratio('trunk', 'Trunk'),
    ratio('left_arm', 'Left arm'),
    ratio('right_arm', 'Right arm'),
    ratio('left_leg', 'Left leg'),
    ratio('right_leg', 'Right leg'),
    {
      id: 'fat_plus_lean',
      label: 'fat mass and lean mass against total weight',
      stated: num(get(metrics, 'weight')),
      computed:
        num(get(metrics, 'fat_mass')) !== null && num(get(metrics, 'lean_mass')) !== null
          ? num(get(metrics, 'fat_mass'))! + num(get(metrics, 'lean_mass'))!
          : null,
      tolerance: 2,
      involved: ['weight', 'fat_mass', 'lean_mass'],
    },
    {
      id: 'fat_percentage',
      label: 'body fat percentage against fat mass',
      stated: num(get(metrics, 'fat_mass')),
      computed:
        num(get(metrics, 'fat_percentage')) !== null && num(get(metrics, 'weight')) !== null
          ? (num(get(metrics, 'fat_percentage'))! * num(get(metrics, 'weight'))!) / 100
          : null,
      tolerance: 2,
      involved: ['fat_mass', 'fat_percentage', 'weight'],
    },
    {
      id: 'lean_percentage',
      label: 'lean mass percentage against lean mass',
      stated: num(get(metrics, 'lean_mass')),
      computed:
        num(get(metrics, 'lean_mass_percentage')) !== null && num(get(metrics, 'weight')) !== null
          ? (num(get(metrics, 'lean_mass_percentage'))! * num(get(metrics, 'weight'))!) / 100
          : null,
      tolerance: 2,
      involved: ['lean_mass', 'lean_mass_percentage', 'weight'],
    },
    {
      id: 'water_compartments',
      label: 'the two water compartments against total water',
      stated: num(get(metrics, 'total_water')),
      computed:
        num(get(metrics, 'intracellular_water')) !== null &&
        num(get(metrics, 'extracellular_water')) !== null
          ? num(get(metrics, 'intracellular_water'))! + num(get(metrics, 'extracellular_water'))!
          : null,
      tolerance: 3,
      involved: ['total_water', 'intracellular_water', 'extracellular_water'],
    },
    {
      id: 'fat_compartments',
      label: 'subcutaneous and visceral fat against total fat mass',
      stated: num(get(metrics, 'fat_mass')),
      computed:
        num(get(metrics, 'subcutaneous_fat_mass')) !== null &&
        num(get(metrics, 'visceral_fat_mass')) !== null
          ? num(get(metrics, 'subcutaneous_fat_mass'))! + num(get(metrics, 'visceral_fat_mass'))!
          : null,
      tolerance: 2,
      involved: ['fat_mass', 'subcutaneous_fat_mass', 'visceral_fat_mass'],
    },
  ];

  for (const check of arithmetic) {
    if (check.stated === null || check.computed === null || check.stated === 0) continue;
    const gap = Math.abs(check.stated - check.computed);
    const off = (gap / Math.abs(check.stated)) * 100;
    if (check.absolute !== undefined ? gap <= check.absolute : off <= check.tolerance) continue;

    const difference = check.absolute !== undefined ? `${gap.toFixed(2)}` : `${off.toFixed(1)}%`;
    flags.push({
      id: `R4:${check.id}`,
      rule: 'R4',
      title: 'Two figures in your report do not agree arithmetically',
      body: `Checking ${check.label}: your report states ${check.stated}, while its own other values work out to ${check.computed.toFixed(2)} — a difference of ${difference}. The original values are preserved exactly as given. This can happen when a provider calculates two figures on different definitions, and it is worth checking the extracted values against your PDF.`,
      metrics: check.involved.map((n) => get(metrics, n)).filter((m): m is CheckMetric => !!m),
      origin: 'extraction',
    });
  }

  const skm = num(get(metrics, 'skeletal_muscle_mass'));
  const lean = num(get(metrics, 'lean_mass'));
  if (skm !== null && lean !== null && skm > lean) {
    flags.push({
      id: 'R4:skeletal_within_lean',
      rule: 'R4',
      title: 'Two figures in your report do not agree arithmetically',
      body: `Skeletal muscle is a part of lean tissue, so it cannot exceed it — yet your report gives skeletal muscle mass as ${skm} and lean mass as ${lean}. Both values are preserved as given; this is worth checking against your PDF.`,
      metrics: [get(metrics, 'skeletal_muscle_mass')!, get(metrics, 'lean_mass')!],
      origin: 'extraction',
    });
  }

  // R5 — measured sides that differ, whatever the summary score says about balance.
  const symmetry = num(get(metrics, 'body_symmetry'));
  for (const [limb, left, right] of [
    ['legs', 'left_leg_muscle_mass', 'right_leg_muscle_mass'],
    ['arms', 'left_arm_muscle_mass', 'right_arm_muscle_mass'],
  ] as const) {
    const l = num(get(metrics, left));
    const r = num(get(metrics, right));
    if (l === null || r === null) continue;

    const diff = (Math.abs(l - r) / ((l + r) / 2)) * 100;
    if (diff <= 5) continue;

    const symmetryNote =
      symmetry === null
        ? ''
        : Math.abs(symmetry - 100) < 1
          ? ` Your report also gives a body symmetry of ${symmetry}, which reads as closely balanced — the two do not agree.`
          : ` Your report gives a body symmetry of ${symmetry}.`;
    const involved = [get(metrics, left)!, get(metrics, right)!];
    if (symmetry !== null) involved.push(get(metrics, 'body_symmetry')!);

    flags.push({
      id: `R5:${limb}`,
      rule: 'R5',
      title: 'Your two sides differ by more than a small margin',
      body: `The measured muscle mass in your ${limb} differs left to right by ${diff.toFixed(1)}%.${symmetryNote} Both figures are from the same report and both are kept as given.`,
      metrics: involved,
      origin: 'source',
    });
  }

  // R6 — classification words this app does not recognise. Skipping them silently would
  // let a new provider vocabulary switch the other rules off without anyone noticing.
  const unknownWords = new Map<string, CheckMetric[]>();
  for (const m of metrics) {
    if (tierOf(m.source_classification) !== 'unknown') continue;
    const word = m.source_classification!.trim();
    unknownWords.set(word, [...(unknownWords.get(word) ?? []), m]);
  }
  for (const [word, carriers] of [...unknownWords].slice(0, 6)) {
    flags.push({
      id: `R6:${word.toLowerCase().replace(/\s+/g, '_')}`,
      rule: 'R6',
      title: `A classification word this app does not recognise: “${word}”`,
      body: `Your report labels ${carriers.map((c) => c.display_name).join(', ')} as “${word}”. The label is preserved exactly as given, but the cross-checks that compare classifications cannot place it on a scale, so those checks are skipped for ${carriers.length === 1 ? 'this measurement' : 'these measurements'}.`,
      metrics: carriers,
      origin: 'extraction',
    });
  }

  return flags;
}
