/**
 * Data Check — surfaces places where a report disagrees with itself.
 *
 * Every rule is explicit and static. Nothing here resolves a conflict, corrects a value,
 * or picks a winner: both readings are shown exactly as the report gives them.
 */

export interface CheckMetric {
  canonical_name: string;
  display_name: string;
  value: number | string;
  unit: string | null;
  source_classification: string | null;
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

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
  label ? (TIERS[label.trim().toLowerCase()] ?? null) : null;

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

    const ta = tierOf(ma.source_classification);
    const tb = tierOf(mb.source_classification);
    if (!ta || !tb || ta === tb) continue;

    const identical = ma.value === mb.value;
    flags.push({
      id: `R1:${a}:${b}`,
      rule: 'R1',
      title: identical
        ? 'The same value carries two different classifications'
        : 'Two related measurements are classified differently',
      body: `${note} Your report classifies ${ma.display_name} as “${ma.source_classification}” and ${mb.display_name} as “${mb.source_classification}”. Both are shown exactly as they appear in your report — these measurements may use different scales or definitions.`,
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
      if (!m || !tier || tier === 'steady') continue;

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
  if (bmi && fatPct && tierOf(bmi.source_classification) !== tierOf(fatPct.source_classification)) {
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
  const arithmetic: {
    id: string;
    label: string;
    stated: number | null;
    computed: number | null;
    tolerance: number;
    involved: string[];
  }[] = [
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
    const off = (Math.abs(check.stated - check.computed) / Math.abs(check.stated)) * 100;
    if (off <= check.tolerance) continue;

    flags.push({
      id: `R4:${check.id}`,
      rule: 'R4',
      title: 'Two figures in your report do not agree arithmetically',
      body: `Checking ${check.label}: your report states ${check.stated}, while its own other values work out to ${check.computed.toFixed(1)} — a difference of ${off.toFixed(1)}%. The original values are preserved exactly as given. This can happen when a provider calculates two figures on different definitions, and it is worth checking the extracted values against your PDF.`,
      metrics: check.involved.map((n) => get(metrics, n)).filter((m): m is CheckMetric => !!m),
      origin: 'extraction',
    });
  }

  // R5 — a symmetry score that disagrees with the measured sides.
  const symmetry = num(get(metrics, 'body_symmetry'));
  if (symmetry !== null && Math.abs(symmetry - 100) < 1) {
    for (const [limb, left, right] of [
      ['legs', 'left_leg_muscle_mass', 'right_leg_muscle_mass'],
      ['arms', 'left_arm_muscle_mass', 'right_arm_muscle_mass'],
    ] as const) {
      const l = num(get(metrics, left));
      const r = num(get(metrics, right));
      if (l === null || r === null) continue;

      const diff = (Math.abs(l - r) / ((l + r) / 2)) * 100;
      if (diff <= 5) continue;

      flags.push({
        id: `R5:${limb}`,
        rule: 'R5',
        title: 'Your symmetry score and your side measurements disagree',
        body: `Your report gives a body symmetry of ${symmetry}, which reads as closely balanced, while the measured muscle mass in your ${limb} differs by ${diff.toFixed(1)}%. Both figures are from the same report and both are kept as given.`,
        metrics: [get(metrics, left)!, get(metrics, right)!, get(metrics, 'body_symmetry')!],
        origin: 'source',
      });
    }
  }

  return flags;
}
