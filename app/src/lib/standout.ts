/**
 * "What stands out" — the few things worth seeing first, assembled strictly from
 * signals that already exist: Data Check flags, the measured left/right difference,
 * and the provider's own words. Nothing here interprets; every string is a flag
 * title, a formatted measured value, or an attributed quote.
 */
import type { Flag } from './dataCheck';
import type { BodyModel } from './bodyModel';
import type { ReportNarrative } from './parser';

export interface Standout {
  id: string;
  kind: 'conflict' | 'divergence' | 'asymmetry' | 'provider';
  eyebrow: string;
  title: string;
  detail: string;
  /** Metric to open when chosen; null for the provider's quote. */
  metric: string | null;
}

interface ValueLike {
  canonical_name: string;
  display_name: string;
  value: number | string;
  unit: string | null;
  source_classification: string | null;
}

const fmt = (m: ValueLike) => `${m.value}${m.unit ? ` ${m.unit}` : ''}`;
const quoted = (m: ValueLike) => (m.source_classification ? `“${m.source_classification}”` : '');

export const MAX_STANDOUTS = 4;

export function buildStandouts(
  flags: Flag[],
  model: BodyModel,
  narrative: ReportNarrative | null,
  metrics: ValueLike[],
): Standout[] {
  const out: Standout[] = [];
  const byName = new Map(metrics.map((m) => [m.canonical_name, m]));

  // 1. The same number wearing two labels — the clearest demonstration of the premise.
  const identical = flags.find(
    (f) => f.rule === 'R1' && f.metrics.length === 2 && f.metrics[0].value === f.metrics[1].value,
  );
  if (identical) {
    const [a, b] = identical.metrics;
    out.push({
      id: identical.id,
      kind: 'conflict',
      eyebrow: 'Same number, two labels',
      title: `${a.display_name} and ${b.display_name} are both ${fmt(a)}`,
      detail: `Your provider labels one ${quoted(a)} and the other ${quoted(b)}`,
      metric: a.canonical_name,
    });
  }

  // 2. BMI and body fat landing in different categories.
  const r3 = flags.find((f) => f.rule === 'R3');
  if (r3 && r3.metrics.length === 2) {
    const [bmi, fat] = r3.metrics;
    out.push({
      id: r3.id,
      kind: 'divergence',
      eyebrow: 'BMI and body fat disagree',
      title: `BMI ${fmt(bmi)} ${quoted(bmi)} · body fat ${fmt(fat)} ${quoted(fat)}`,
      detail: 'They measure different things, and here they fall in different categories',
      metric: fat.canonical_name,
    });
  }

  // 3. The larger measured left/right difference, ranked by kilograms rather than
  //    percent so a tenth of a kilo in a small arm does not outrank a leg.
  const pairs = [
    { limb: 'legs', one: 'leg', share: model.asymmetry.legs, l: 'left_leg_muscle_mass', r: 'right_leg_muscle_mass' },
    { limb: 'arms', one: 'arm', share: model.asymmetry.arms, l: 'left_arm_muscle_mass', r: 'right_arm_muscle_mass' },
  ]
    .map((p) => ({ ...p, L: byName.get(p.l), R: byName.get(p.r) }))
    .filter((p) => p.L && p.R && typeof p.L.value === 'number' && typeof p.R.value === 'number')
    .map((p) => ({ ...p, kg: Math.abs((p.L!.value as number) - (p.R!.value as number)) }))
    .filter((p) => Math.abs(p.share) >= 0.03)
    .sort((p, q) => q.kg - p.kg);

  const biggest = pairs[0];
  if (biggest) {
    const heavierLeft = biggest.share > 0;
    out.push({
      id: `asymmetry:${biggest.limb}`,
      kind: 'asymmetry',
      eyebrow: `Your ${biggest.limb} differ`,
      title: `${heavierLeft ? 'Left' : 'Right'} ${biggest.one} carries ${biggest.kg.toFixed(1)} kg more muscle — ${(Math.abs(biggest.share) * 100).toFixed(1)}%`,
      detail: `Left ${fmt(biggest.L!)} · right ${fmt(biggest.R!)}, as measured`,
      metric: heavierLeft ? biggest.l : biggest.r,
    });
  }

  // 4. The provider's own first finding, in their words, attributed.
  const first = narrative?.critical_findings.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
  if (first) {
    out.push({
      id: 'provider:critical_findings',
      kind: 'provider',
      eyebrow: 'From your provider',
      title: first,
      detail: 'Their words, reproduced as given — not Body Atlas’s reading of your data',
      metric: null,
    });
  }

  return out.slice(0, MAX_STANDOUTS);
}
