# Body Atlas — Project Brief

**Paste this once at the start of the Fable session, before Stage 1. Everything after
it builds on it.**

---

You are building **Body Atlas**, a browser application that turns uploaded
body-composition reports into an interactive, data-derived visual model of a person's
body, and keeps a longitudinal record as more reports are added.

Build it in four stages. I will give you one stage at a time. **Do not build ahead.**
Finish the stage, confirm its acceptance checks pass, and stop.

## The one interaction that matters

Upload a health PDF → the system reads it → it becomes a body on screen → click the body
and understand the numbers → upload another report → see what changed.

Everything else is secondary. Judge your own work against whether that loop is accurate,
trustworthy and beautiful — not against feature count.

## Stack (fixed — do not substitute)

- React + TypeScript + Vite
- Three.js directly (not react-three-fiber: it pins React below 19.3 and pulls in Expo
  peers, and the geometry here is custom and imperative, so the wrapper earns nothing)
- `pdfjs-dist` for PDF text extraction
- IndexedDB via `dexie` for all persistence
- Tailwind CSS
- Vitest for tests

No backend. No server. No accounts. No authentication. All data stays in the browser.
Health data never leaves the device — this is the privacy model for this prototype.

**No AI or LLM calls at runtime.** The extraction parser is deterministic. The
explanation content is generated once at build time into a static JSON file. The shipped
app makes zero network calls to any model API and requires no API key.

## Non-negotiable product principles

1. **Data before decoration.** The 3D body is driven by real measurements. If it is not
   data-driven it has no reason to exist.
2. **Never fabricate.** If the report does not measure something, the app must not imply
   it did. Unmeasured anatomy is visibly marked as unmeasured.
3. **Explain, don't diagnose.** Help people understand their data. Never diagnose, never
   assert causality, never predict outcomes.
4. **Preserve the source.** Original value, unit, date, provider, page and the provider's
   own classification label are stored and always retrievable.
5. **Never invent reference ranges.** If the report does not state one, display
   *"Reference range not provided in this report."*
6. **Never silently resolve a conflict.** When the report contradicts itself, show both
   values and say so.
7. **Uncertainty is visible.** Everything on screen is tagged `measured`, `derived`,
   `interpreted`, or `illustrative`, and the user can discover which.

## Provenance model

Every value carries one of four levels, and the UI exposes it:

| Level | Meaning | Example |
|---|---|---|
| `measured` | Read directly from the report | Body fat 35.6% |
| `derived` | Computed from measured values | Segment radius from muscle mass |
| `interpreted` | Explanatory content | "This measurement relates to…" |
| `illustrative` | Visual representation, not a measurement | Segment lengths, trunk shape |

## Data model

```ts
type Provenance = 'measured' | 'derived' | 'interpreted' | 'illustrative';

interface Profile {
  id: string;
  subject_name: string | null;
  age: number | null;
  sex: string | null;          // as stated by the report; never inferred
  height_cm: number | null;
  created_at: string;
}

interface Report {
  id: string;
  profile_id: string;
  provider: string;            // e.g. "FITTR"
  report_type: 'body_composition';
  measurement_date: string;    // ISO date
  uploaded_at: string;
  original_file: Blob;         // the uploaded PDF, kept verbatim
  file_name: string;
  extraction_status: 'parsed' | 'verified';
  metric_count: number;
}

interface Metric {
  id: string;
  report_id: string;
  profile_id: string;
  canonical_name: string;
  display_name: string;
  value: number | string;
  unit: string | null;
  measurement_date: string;
  category: string;
  source_classification: string | null;   // the report's own label, verbatim
  source_reference_range: string | null;  // only if the report states one
  source_page: number | null;
  provenance: Provenance;
  confidence: 'high' | 'low';
  edited_by_user: boolean;
}

interface Snapshot {
  id: string;
  report_id: string;
  profile_id: string;
  measurement_date: string;
  body_parameters: Record<string, number>;  // inputs to the mesh generator
  visualization_version: 'v1';
}
```

## Navigation

Three areas only: **BODY**, **TIMELINE**, **REPORTS**.

There is no Ask tab and no separate Insights tab in this build. Conflict flags,
relationships and missing-data content surface inside the Body view and the metric detail
panel where they are relevant.

## Visual direction

Premium, scientific, calm. Dark neutral environment, restrained palette with a single
accent, the body dominating the frame, translucent information panels, minimal
typography. Motion is purposeful and short — it communicates change, it does not perform.

Avoid: hospital-dashboard chrome, spreadsheet screens, cartoon anatomy, gamification.

**Budget discipline:** correctness and honesty first, polish second. Do not spend
iterations on particle effects, cinematic intros or elaborate easing. A clean, restrained
result that is truthful beats an impressive one that overclaims.

## Language guardrails

Permitted: *may*, *can be associated with*, *can provide context*, *worth discussing*,
*additional information would be needed*.

Forbidden anywhere in the product: *you have*, *this proves*, *this means you definitely*,
*you are at risk of*.

## Reference documents

Three companion specs accompany these stages. Treat them as authoritative:

- `reference/metric-catalog.md` — every canonical metric, its key, unit and category
- `reference/body-model-spec.md` — how the 3D body is generated from mass measurements
- `reference/relationships-and-conflicts.md` — the relationship graph and Data Check rules

Acknowledge you have read all three, then wait for Stage 1.
