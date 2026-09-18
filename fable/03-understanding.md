# Stage 3 — Understanding

**Goal:** every number becomes explainable, connected, and honest about what it does not
know.

Read `reference/relationships-and-conflicts.md` before starting.

---

## Build

### 1. Metric knowledge file

Generate **once, at build time**, a static `src/data/metric-knowledge.json` covering every
metric in `reference/metric-catalog.md`. Per metric:

```json
{
  "canonical_name": "intracellular_water",
  "definition": "Water measured within the body's cells.",
  "plain_language": "Think of this as the water held inside your body's cells.",
  "why_it_matters": "...",
  "measurement_limitations": "...",
  "what_could_add_context": ["..."],
  "safety_note": "..."
}
```

Requirements:

- Written for a layperson. No jargon unless it is defined in the same breath.
- Describe what the metric *is* and why it is generally tracked. **Never** describe what a
  particular value indicates about a person — that is decided at runtime by pairing the
  definition with the user's own value and their report's own classification.
- Language guardrails apply to every string.
- This is a file I can read and correct. Keep it tidy and reviewable.

The app reads this file. It makes no model calls at runtime.

### 2. Guardrail lint

A test that scans every string in `metric-knowledge.json` for the forbidden phrases in the
brief and **fails the build** on a hit. This is the mechanical safety net for generated
content — do not skip it.

### 3. Metric detail panel

Opened from a region, a headline value, or a metric list. Same structure every time:

**\<Display name\>** · **\<value\> \<unit\>** · Source classification: **\<verbatim label\>**

- **What is this?** — the definition, with a toggle to plain-language phrasing.
- **Why does it matter?** — general significance of the metric.
- **Your result** — the user's actual value and what the *report's* classification means
  in context. Never merely repeat the word "High". Never convert the provider's label into
  a different clinical claim.
- **What is it connected to?** — related metrics from the relationship graph, each with its
  `why` line. Clicking one navigates to its detail panel. This should feel like it is
  worth following.
- **What don't we know?** — relevant entries from the missing-data registry, framed as
  context that could be added, never as a test the user needs.
- **How has it changed?** — hidden entirely until Stage 4 gives it history.

If the report stated no reference range: *"Reference range not provided in this report."*

### 4. Data Check

Run rules R1–R5 over a verified report and surface flags.

Entry point: a quiet, non-alarming indicator on the Body view — *"Data Check: 2 things to
know"* — opening a panel listing each flag with both values, both classifications, and the
neutral explanation.

The reference report should produce at least the visceral fat mass/level conflict (R1) and
the BMI/body fat divergence (R3). Verify both appear.

Arithmetic flags (R4) route the user back to verification, since they usually mean an
extraction error rather than a report problem.

### 5. Provider content, attributed

Where the report contains its own recommendations, show them under **What your report
recommends**, clearly attributed to the provider. Never present them as Body Atlas's own
advice, and never generate additional recommendations.

### 6. Provider-derived scores

`health_score`, `body_health_status`, `body_age`, `body_type` display as **reported by
your scan provider**, with: *"How was this calculated? Methodology not stated in this
report."*

For body age specifically: *"Body age is a provider-derived metric. Its meaning depends on
the methodology used by the provider."* Do not treat it as biological age. Do not
reverse-engineer any scoring formula.

## Acceptance checks

1. Every extracted metric opens a detail panel with all sections populated.
2. The guardrail lint runs and passes; deliberately inserting a forbidden phrase makes it fail.
3. Following "connected to" links from body fat reaches fat mass, BMI, regional fat and
   muscle-to-fat ratios.
4. The reference report raises the visceral fat and BMI/body-fat flags, with both original
   classifications shown and neither corrected.
5. No string anywhere diagnoses, asserts causality, or predicts an outcome.
6. The app makes zero network requests at runtime — verify in the network tab.

## Do not build in this stage

Natural-language Q&A. Timeline. Comparison. Any runtime model call.
