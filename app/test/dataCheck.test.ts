import { readFileSync, existsSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { parsePdf, type ParsedReport } from '../src/lib/parser';
import { runDataCheck, type CheckMetric, type Flag } from '../src/lib/dataCheck';

const fixture = (n: string) => new URL(`./fixtures/${n}`, import.meta.url);
const has = (n: string) => existsSync(fixture(n));

async function checked(file: string): Promise<{ parsed: ParsedReport; flags: Flag[] }> {
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
  return { parsed, flags: runDataCheck(metrics, parsed.narrative) };
}

const byId = (flags: Flag[], id: string) => flags.find((f) => f.id === id);

const describeIf = (n: string) => (has(n) ? describe : describe.skip);

describeIf('report-a.pdf')('Data Check on report A', () => {
  test('flags lean mass and fat-free mass: same value, opposite labels', async () => {
    const { flags } = await checked('report-a.pdf');
    const flag = byId(flags, 'R1:lean_mass:fat_free_mass');

    expect(flag).toBeDefined();
    expect(flag!.title).toContain('same value');
    expect(flag!.metrics[0].value).toBe(flag!.metrics[1].value);
    expect(flag!.body).toContain('Healthy');
    expect(flag!.body).toContain('Low');
  });

  test('flags visceral fat mass against visceral fat level', async () => {
    const { flags } = await checked('report-a.pdf');
    const flag = byId(flags, 'R1:visceral_fat_mass:visceral_fat_level');

    expect(flag).toBeDefined();
    expect(flag!.body).toContain('High');
    expect(flag!.body).toContain('Low');
  });

  test('flags BMI against body fat', async () => {
    const { flags } = await checked('report-a.pdf');
    expect(byId(flags, 'R3:bmi:fat_percentage')).toBeDefined();
  });

  test('flags the lean mass percentage arithmetic, and only that one', async () => {
    const { flags } = await checked('report-a.pdf');
    const arithmetic = flags.filter((f) => f.rule === 'R4').map((f) => f.id);

    // Every other percentage in this report is internally exact.
    expect(arithmetic).toEqual(['R4:lean_percentage']);
    expect(byId(flags, 'R4:lean_percentage')!.body).toContain('34.9');
  });

  test('catches the report claiming normal water while its tables say low', async () => {
    const { flags } = await checked('report-a.pdf');
    const water = flags.filter((f) => f.rule === 'R2' && f.metrics[0].canonical_name === 'water_percentage');

    expect(water.length).toBeGreaterThan(0);
    expect(water[0].body).toMatch(/normal range|healthy range/i);
    expect(water[0].body).toContain('Low');
  });

  test('catches the summary calling visceral fat level normal while the table says Low', async () => {
    const { flags } = await checked('report-a.pdf');
    const visceral = flags.filter(
      (f) => f.rule === 'R2' && f.metrics[0].canonical_name === 'visceral_fat_level',
    );
    expect(visceral.length).toBeGreaterThan(0);
  });

  test('does not blame body fat for a claim made about visceral fat in the same sentence', async () => {
    const { flags } = await checked('report-a.pdf');
    // Page 6 reads: "visceral fat level of 8 is within the normal range, but your high
    // body fat percentage may increase your risk..." — only the first clause is a claim.
    const fatClaims = flags.filter(
      (f) => f.rule === 'R2' && f.metrics[0].canonical_name === 'fat_percentage',
    );
    expect(fatClaims).toEqual([]);
  });

  test('flags a symmetry score of 100.4 against legs differing by more than 5%', async () => {
    const { flags } = await checked('report-a.pdf');
    const flag = byId(flags, 'R5:legs');

    expect(flag).toBeDefined();
    expect(flag!.body).toContain('100.4');
  });

  test('never resolves a conflict — both readings survive in every flag', async () => {
    const { flags } = await checked('report-a.pdf');
    expect(flags.length).toBeGreaterThan(4);

    for (const flag of flags) {
      expect(flag.metrics.length).toBeGreaterThan(0);
      expect(flag.body).not.toMatch(/correct value is|we have corrected|the right figure/i);
    }
  });

  test('parses the report’s own prose and recommendations', async () => {
    const { parsed } = await checked('report-a.pdf');
    expect(parsed.narrative.summary).toContain('35.6%');
    expect(parsed.narrative.critical_findings).toContain('visceral fat level');
    expect(parsed.narrative.recommendations.length).toBe(6);
    expect(parsed.narrative.recommendations[0]).toMatch(/^Focus on a balanced diet/);
  });
});

describeIf('report-b.pdf')('Data Check on report B', () => {
  test('flags the same lean/fat-free contradiction in a different person’s report', async () => {
    const { flags } = await checked('report-b.pdf');
    const flag = byId(flags, 'R1:lean_mass:fat_free_mass');

    expect(flag).toBeDefined();
    expect(flag!.body).toContain('Athletic');
    expect(flag!.body).toContain('Low');
  });

  test('flags the same lean percentage arithmetic error', async () => {
    const { flags } = await checked('report-b.pdf');
    expect(byId(flags, 'R4:lean_percentage')).toBeDefined();
  });

  test('does not raise a symmetry flag when the score itself is not near 100', async () => {
    const { flags } = await checked('report-b.pdf');
    // Report B gives 96.7, which does not claim balance, so there is nothing to contradict.
    expect(flags.filter((f) => f.rule === 'R5')).toEqual([]);
  });
});

describe('rules stay quiet on a consistent report', () => {
  test('a report that agrees with itself raises nothing', () => {
    const metrics: CheckMetric[] = [
      { canonical_name: 'weight', display_name: 'Weight', value: 70, unit: 'kg', source_classification: 'Normal' },
      { canonical_name: 'fat_mass', display_name: 'Fat Mass', value: 14, unit: 'kg', source_classification: 'Normal' },
      { canonical_name: 'lean_mass', display_name: 'Lean Mass', value: 56, unit: 'kg', source_classification: 'Normal' },
      { canonical_name: 'fat_free_mass', display_name: 'Fat-Free Mass', value: 56, unit: 'kg', source_classification: 'Healthy' },
      { canonical_name: 'fat_percentage', display_name: 'Body Fat', value: 20, unit: '%', source_classification: 'Normal' },
      { canonical_name: 'bmi', display_name: 'BMI', value: 22, unit: null, source_classification: 'Normal' },
    ];

    // "Normal" against "Healthy" is not a disagreement.
    expect(runDataCheck(metrics)).toEqual([]);
  });
});
