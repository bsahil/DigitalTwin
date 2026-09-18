import { describe, test, expect } from 'vitest';
import { CATALOG, DERIVED_FROM, PROVENANCE, provenanceFor } from '../src/lib/catalog';
import {
  CLUSTERS,
  FORBIDDEN_PHRASES,
  KNOWLEDGE,
  MISSING_DATA,
  missingFor,
  relatedTo,
} from '../src/lib/knowledge';

describe('metric knowledge content', () => {
  test('every catalog metric has an entry', () => {
    const missing = CATALOG.map((c) => c.canonical_name).filter((n) => !KNOWLEDGE[n]);
    expect(missing, `metrics without knowledge entries: ${missing.join(', ')}`).toEqual([]);
  });

  test('every entry has all required fields filled', () => {
    for (const [name, k] of Object.entries(KNOWLEDGE)) {
      for (const field of [
        'definition',
        'plain_language',
        'why_it_matters',
        'measurement_limitations',
      ] as const) {
        expect(k[field], `${name}.${field}`).toBeTruthy();
        expect(k[field].length, `${name}.${field} too short`).toBeGreaterThan(20);
      }
      expect(Array.isArray(k.what_could_add_context), `${name}.what_could_add_context`).toBe(true);
    }
  });

  /**
   * The mechanical safety net. Generated explanatory copy cannot reach the UI carrying a
   * diagnosis or a causal claim without this failing first.
   */
  test('no entry uses a forbidden phrase', () => {
    const hits: string[] = [];

    for (const [name, k] of Object.entries(KNOWLEDGE)) {
      const text = [
        k.definition,
        k.plain_language,
        k.why_it_matters,
        k.measurement_limitations,
        k.safety_note ?? '',
        ...k.what_could_add_context,
      ]
        .join(' ')
        .toLowerCase();

      for (const phrase of FORBIDDEN_PHRASES) {
        if (text.includes(phrase)) hits.push(`${name}: "${phrase}"`);
      }
    }

    expect(hits, `forbidden phrasing found:\n${hits.join('\n')}`).toEqual([]);
  });

  test('the lint would catch a forbidden phrase if one were introduced', () => {
    const bad = 'Your report shows you have a problem.'.toLowerCase();
    expect(FORBIDDEN_PHRASES.some((p) => bad.includes(p))).toBe(true);
  });

  test('cross-references point at metrics that exist', () => {
    const known = new Set(CATALOG.map((c) => c.canonical_name));
    for (const [name, k] of Object.entries(KNOWLEDGE)) {
      for (const ref of k.what_could_add_context) {
        expect(known.has(ref), `${name} references unknown metric ${ref}`).toBe(true);
      }
    }
  });
});

describe('relationship graph', () => {
  test('every cluster member is a real metric', () => {
    const known = new Set(CATALOG.map((c) => c.canonical_name));
    for (const cluster of CLUSTERS) {
      for (const m of cluster.members) {
        expect(known.has(m), `cluster ${cluster.id} references unknown metric ${m}`).toBe(true);
      }
    }
  });

  test('body fat reaches fat mass, BMI, regional fat and the ratios', () => {
    const available = new Set(CATALOG.map((c) => c.canonical_name));
    const reached = new Set(relatedTo('fat_percentage', available).flatMap((g) => g.members));

    expect(reached.has('fat_mass')).toBe(true);
    expect(reached.has('bmi')).toBe(true);
    expect(reached.has('lean_mass')).toBe(true);
  });

  test('a region links its own muscle, fat and ratio', () => {
    const available = new Set(CATALOG.map((c) => c.canonical_name));
    const reached = new Set(relatedTo('left_leg_muscle_mass', available).flatMap((g) => g.members));

    expect(reached.has('left_leg_fat_mass')).toBe(true);
    expect(reached.has('left_leg_muscle_fat_ratio')).toBe(true);
    expect(reached.has('right_leg_muscle_mass')).toBe(true);
  });

  test('relationships only offer metrics the report actually contains', () => {
    const sparse = new Set(['fat_mass', 'weight']);
    const reached = relatedTo('fat_percentage', sparse).flatMap((g) => g.members);

    expect(reached).toContain('fat_mass');
    expect(reached).not.toContain('bmi');
  });

  test('a metric is never listed as related to itself', () => {
    const available = new Set(CATALOG.map((c) => c.canonical_name));
    for (const { canonical_name } of CATALOG) {
      const reached = relatedTo(canonical_name, available).flatMap((g) => g.members);
      expect(reached).not.toContain(canonical_name);
    }
  });
});

describe('missing data registry', () => {
  test('entries are framed as context, never as an instruction', () => {
    for (const m of MISSING_DATA) {
      const text = m.context.toLowerCase();
      expect(text).not.toContain('you need');
      expect(text).not.toContain('you must');
      expect(text).not.toContain('get tested');
    }
  });

  test('visceral fat surfaces blood measurements a scan cannot provide', () => {
    const ids = missingFor('visceral_fat_mass').map((m) => m.id);
    expect(ids).toContain('blood_lipids');
    expect(ids).toContain('blood_glucose');
  });

  test('every registry entry points at metrics that exist', () => {
    const known = new Set(CATALOG.map((c) => c.canonical_name));
    for (const m of MISSING_DATA) {
      for (const ref of m.relevantTo) {
        expect(known.has(ref), `${m.id} references unknown metric ${ref}`).toBe(true);
      }
    }
  });
});

describe('provenance', () => {
  test('every catalog metric is classified explicitly — none falls through to a default', () => {
    const missing = CATALOG.map((c) => c.canonical_name).filter((n) => !(n in PROVENANCE));
    expect(missing, `unclassified: ${missing.join(', ')}`).toEqual([]);
  });

  test('nothing in the provenance map is a metric the catalog does not know', () => {
    const known = new Set(CATALOG.map((c) => c.canonical_name));
    for (const name of Object.keys(PROVENANCE)) expect(known.has(name), name).toBe(true);
  });

  test('provider judgements and arithmetic are never labelled as measured', () => {
    for (const name of ['bmi', 'body_age', 'health_score', 'left_leg_muscle_fat_ratio', 'ideal_weight', 'visceral_fat_level']) {
      expect(provenanceFor(name), name).not.toBe('measured');
    }
    for (const name of ['weight', 'fat_mass', 'left_leg_muscle_mass', 'heart_rate']) {
      expect(provenanceFor(name), name).toBe('measured');
    }
  });

  test('every derived metric says what it is derived from, and only from real metrics', () => {
    const known = new Set(CATALOG.map((c) => c.canonical_name));
    const derived = Object.entries(PROVENANCE).filter(([, p]) => p === 'derived').map(([n]) => n);
    for (const name of derived) {
      const sources = DERIVED_FROM[name];
      expect(sources, `${name} has no derivation sources`).toBeDefined();
      expect(sources.length).toBeGreaterThan(0);
      for (const src of sources) expect(known.has(src), `${name} ← ${src}`).toBe(true);
    }
  });
});

describe('coverage', () => {
  test('no catalog metric is a relationship orphan', () => {
    const inCluster = new Set(CLUSTERS.flatMap((c) => c.members));
    const orphans = CATALOG.map((c) => c.canonical_name).filter((n) => !inCluster.has(n));
    expect(orphans, `"What is it connected to?" renders nothing for: ${orphans.join(', ')}`).toEqual([]);
  });

  test('every catalog metric has at least one thing the scan cannot tell it', () => {
    const covered = new Set(MISSING_DATA.flatMap((m) => m.relevantTo));
    const uncovered = CATALOG.map((c) => c.canonical_name).filter((n) => !covered.has(n));
    expect(uncovered, `"What don't we know?" never renders for: ${uncovered.join(', ')}`).toEqual([]);
  });
});
