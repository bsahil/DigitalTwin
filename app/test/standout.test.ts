import { readFileSync, existsSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { parsePdf } from '../src/lib/parser';
import { runDataCheck, type CheckMetric } from '../src/lib/dataCheck';
import { buildBodyModel, type MetricValues } from '../src/lib/bodyModel';
import { FORBIDDEN_PHRASES } from '../src/lib/knowledge';
import { buildStandouts, MAX_STANDOUTS } from '../src/lib/standout';

const fixture = (n: string) => new URL(`./fixtures/${n}`, import.meta.url);
const has = (n: string) => existsSync(fixture(n));
const describeIf = (n: string) => (has(n) ? describe : describe.skip);

async function standoutsFor(file: string) {
  const buf = readFileSync(fixture(file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const parsed = await parsePdf(ab);

  const metrics: CheckMetric[] = parsed.metrics.map((m) => ({
    canonical_name: m.canonical_name,
    display_name: m.display_name,
    value: m.value,
    unit: m.unit,
    source_classification: m.source_classification,
  }));
  const values: MetricValues = {};
  for (const m of parsed.metrics) if (typeof m.value === 'number') values[m.canonical_name] = m.value;

  const model = buildBodyModel(values, parsed.height_cm_derived!);
  const flags = runDataCheck(metrics, parsed.narrative);
  return { standouts: buildStandouts(flags, model, parsed.narrative, metrics), parsed };
}

describeIf('report-a.pdf')('what stands out on report A', () => {
  test('leads with the identical value carrying two labels', async () => {
    const { standouts } = await standoutsFor('report-a.pdf');
    expect(standouts[0].kind).toBe('conflict');
    expect(standouts[0].title).toContain('34.9 kg');
    expect(standouts[0].detail).toContain('Healthy');
    expect(standouts[0].detail).toContain('Low');
    expect(standouts[0].metric).toBe('lean_mass');
  });

  test('shows the BMI / body fat divergence with both labels', async () => {
    const { standouts } = await standoutsFor('report-a.pdf');
    const d = standouts.find((s) => s.kind === 'divergence')!;
    expect(d.title).toContain('19.9');
    expect(d.title).toContain('35.6 %');
    expect(d.title).toContain('Normal');
    expect(d.title).toContain('High');
  });

  test('ranks the asymmetry by kilograms, so the legs outrank the arms', async () => {
    const { standouts } = await standoutsFor('report-a.pdf');
    const a = standouts.find((s) => s.kind === 'asymmetry')!;
    // Legs differ by 0.3 kg (5.6%); arms by 0.1 kg (6.1%). Percent alone would pick the arms.
    expect(a.eyebrow).toContain('legs');
    expect(a.title).toContain('0.3 kg');
    expect(a.detail).toContain('5.5 kg');
    expect(a.detail).toContain('5.2 kg');
    expect(a.metric).toBe('left_leg_muscle_mass');
  });

  test('quotes the provider’s first finding and attributes it', async () => {
    const { standouts, parsed } = await standoutsFor('report-a.pdf');
    const p = standouts.find((s) => s.kind === 'provider')!;
    expect(parsed.narrative.critical_findings.startsWith(p.title)).toBe(true);
    expect(p.detail.toLowerCase()).toContain('their words');
    expect(p.metric).toBeNull();
  });

  test('never exceeds the cap', async () => {
    const { standouts } = await standoutsFor('report-a.pdf');
    expect(standouts.length).toBeLessThanOrEqual(MAX_STANDOUTS);
  });
});

describeIf('report-b.pdf')('what stands out on report B', () => {
  test('still leads with the identical-value conflict, with that report’s labels', async () => {
    const { standouts } = await standoutsFor('report-b.pdf');
    expect(standouts[0].kind).toBe('conflict');
    expect(standouts[0].title).toContain('59.4 kg');
    expect(standouts[0].detail).toContain('Athletic');
  });

  test('raises no asymmetry item when the sides are within the margin', async () => {
    const { standouts } = await standoutsFor('report-b.pdf');
    // Legs 1%, arms 3.3% — only the arms cross 3%, by 0.1 kg.
    const a = standouts.find((s) => s.kind === 'asymmetry');
    if (a) expect(a.eyebrow).toContain('arms');
  });
});

describe('standout copy obeys the guardrails', () => {
  test('no generated string on either report uses a forbidden phrase of Body Atlas’s own', async () => {
    for (const file of ['report-a.pdf', 'report-b.pdf']) {
      if (!has(file)) continue;
      const { standouts } = await standoutsFor(file);
      for (const s of standouts) {
        // The provider's quote is theirs, attributed; the guardrail governs our copy.
        const ours = s.kind === 'provider' ? `${s.eyebrow} ${s.detail}` : `${s.eyebrow} ${s.title} ${s.detail}`;
        for (const phrase of FORBIDDEN_PHRASES) {
          expect(ours.toLowerCase(), `${file}: "${phrase}" in ${s.id}`).not.toContain(phrase);
        }
      }
    }
  });

  test('produces nothing from nothing', () => {
    const model = buildBodyModel({}, 170);
    expect(buildStandouts([], model, null, [])).toEqual([]);
  });
});
