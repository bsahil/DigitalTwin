import { BY_LABEL, SECTION_HEADINGS, UNITS, type Category } from './catalog';

export interface ParsedMetric {
  canonical_name: string;
  label: string;
  display_name: string;
  value: number | string;
  unit: string | null;
  source_classification: string | null;
  source_page: number;
  category: Category;
  confidence: 'high' | 'low';
}

/** The report's own prose, kept so its claims can be checked against its own tables. */
export interface ReportNarrative {
  summary: string;
  critical_findings: string;
  recommendations: string[];
}

export interface ParsedReport {
  provider: string;
  subject_name: string | null;
  age: number | null;
  sex: string | null;
  measurement_date: string | null;
  height_cm_derived: number | null;
  metrics: ParsedMetric[];
  unmapped: { label: string; page: number }[];
  narrative: ReportNarrative;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Page 1 prints its header letter-spaced: "R e p o r t  c r e a t e d ...". */
function parseHeader(tokens: string[]) {
  const joined = tokens.join('\n');
  const squashed = joined.replace(/ /g, '');
  const date = squashed.match(/(\d{2})\/(\d{2})\/(\d{4})/);

  const ageMatch = joined.match(/Age:\s*(\d+)/);
  const sexMatch = joined.match(/Gender:\s*(\w+)/);

  let name: string | null = null;
  const ageIdx = tokens.findIndex((t) => /^Age:/.test(t));
  if (ageIdx > 0) name = tokens[ageIdx - 1].trim() || null;

  return {
    subject_name: name,
    age: ageMatch ? Number(ageMatch[1]) : null,
    sex: sexMatch ? sexMatch[1] : null,
    measurement_date: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
  };
}

/** Longest first, so "Lean mass percentage" wins over "Lean mass". */
const LABELS_BY_LENGTH = [...BY_LABEL.keys()].sort((a, b) => b.length - a.length);

function isPageFurniture(line: string): boolean {
  return (
    line.startsWith('Disclaimer') ||
    line.startsWith('professional medical advice') ||
    line.includes('|') ||
    /^\d{1,2}$/.test(line)
  );
}

/**
 * A row arrives as one line: "<label> <value> [unit] [status]". Unit and status are
 * each independently optional and a status may be several words ("Mild Asymmetry"),
 * so the row is read left to right after matching the label rather than by splitting
 * into a fixed number of columns.
 */
function parseRow(line: string, page: number, fallback: Category | null): ParsedMetric | null {
  const label = LABELS_BY_LENGTH.find((l) => line === l || line.startsWith(l + ' '));
  if (!label) return null;

  const entry = BY_LABEL.get(label)!;
  const rest = line.slice(label.length).trim();

  const metric: ParsedMetric = {
    canonical_name: entry.canonical_name,
    label: entry.label,
    display_name: entry.display_name,
    value: '',
    unit: null,
    source_classification: null,
    source_page: page,
    category: entry.category ?? fallback ?? 'body_composition',
    confidence: 'high',
  };

  if (entry.categorical) {
    metric.value = rest;
    if (!rest) metric.confidence = 'low';
    return metric;
  }

  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || !NUMERIC.test(parts[0])) {
    metric.value = rest;
    metric.confidence = 'low';
    return metric;
  }

  metric.value = Number(parts[0]);
  let i = 1;
  if (i < parts.length && UNITS.has(parts[i])) metric.unit = parts[i++];
  const status = parts.slice(i).join(' ');
  metric.source_classification = status || null;

  return metric;
}

const NARRATIVE_STOP = [
  'Disclaimer',
  'professional medical advice',
  'Immediate attention',
  'Keep monitoring',
  'Make your next report better',
];

/** Prose lines following a heading, stopping at the page's boilerplate. */
function proseAfter(lines: string[], heading: string): string {
  const start = lines.findIndex((l) => l === heading);
  if (start === -1) return '';

  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (NARRATIVE_STOP.some((s) => line.startsWith(s))) break;
    if (isPageFurniture(line)) continue;
    body.push(line);
  }
  return body.join(' ').replace(/\s+/g, ' ').trim();
}

function parseNarrative(pages: string[][]): ReportNarrative {
  let summary = '';
  let critical = '';
  let recommendations: string[] = [];

  for (const lines of pages) {
    summary ||= proseAfter(lines, 'Your Health Summary');
    critical ||= proseAfter(lines, 'Critical Findings');

    const recs = proseAfter(lines, 'Lifestyle Recommendations');
    if (recs && recommendations.length === 0) {
      recommendations = recs
        .split(/(?=\b\d+\.\s)/)
        .map((r) => r.replace(/^\d+\.\s*/, '').trim())
        .filter((r) => r.length > 10);
    }
  }

  return { summary, critical_findings: critical, recommendations };
}

export function parseTokens(pages: string[][]): ParsedReport {
  const header = parseHeader(pages[0] ?? []);
  const metrics: ParsedMetric[] = [];
  const unmapped: { label: string; page: number }[] = [];
  const seen = new Set<string>();
  let category: Category | null = null;

  pages.forEach((lines, pageIdx) => {
    const page = pageIdx + 1;

    for (const l of lines) {
      if (SECTION_HEADINGS[l]) category = SECTION_HEADINGS[l];
    }

    const headerIdx = lines.findIndex((l) => l.startsWith('Metric Name'));
    if (headerIdx === -1) return;

    for (const line of lines.slice(headerIdx + 1)) {
      if (isPageFurniture(line)) continue;

      const metric = parseRow(line, page, category);
      if (metric) {
        if (seen.has(metric.canonical_name)) continue;
        seen.add(metric.canonical_name);
        metrics.push(metric);
        continue;
      }

      // A labelled value the catalog does not know. Kept, never guessed at.
      if (line.length < 60 && /\s-?\d+(\.\d+)?(\s|$)/.test(line)) {
        unmapped.push({ label: line, page });
      }
    }
  });

  const weight = metrics.find((m) => m.canonical_name === 'weight')?.value;
  const bmi = metrics.find((m) => m.canonical_name === 'bmi')?.value;
  const height_cm_derived =
    typeof weight === 'number' && typeof bmi === 'number' && bmi > 0
      ? Math.round(Math.sqrt(weight / bmi) * 1000) / 10
      : null;

  return {
    provider: 'FITTR',
    ...header,
    height_cm_derived,
    metrics,
    unmapped,
    narrative: parseNarrative(pages),
  };
}

/**
 * Reads a PDF into per-page token arrays. Uses pdfjs's legacy build, which runs
 * unmodified in both the browser and Node — the standard build requires a newer
 * runtime than Node 22 provides.
 */
export async function extractTokens(data: ArrayBuffer): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[][] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const tokens: string[] = [];
    let buffer = '';

    for (const item of content.items) {
      if (!('str' in item)) continue;
      buffer += item.str;
      if (item.hasEOL) {
        const t = buffer.trim();
        if (t) tokens.push(t);
        buffer = '';
      }
    }
    const tail = buffer.trim();
    if (tail) tokens.push(tail);

    pages.push(tokens);
  }

  return pages;
}

export async function parsePdf(data: ArrayBuffer): Promise<ParsedReport> {
  return parseTokens(await extractTokens(data));
}
