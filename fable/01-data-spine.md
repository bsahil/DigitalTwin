# Stage 1 — Data Spine

**Goal:** a real PDF goes in, correct verified metrics come out and persist. No 3D yet.

Nothing later works if this stage is wrong, so it is first and it is tested.

---

## Before you write code

I have attached the reference report PDF to this session. **Read its actual text layout
first.** Extract the raw text with `pdfjs-dist` and inspect how labels, values, units and
classification words are positioned on each page.

Write the parser against what you actually find in the file. Do not write it against
assumptions about how a report "probably" looks. If the file has no text layer and is
image-only, stop and tell me before proceeding — that changes the approach and I need to
decide.

## Build

### 1. Upload

Landing screen. Headline **"Build your body map"**, subheading *"Upload a health or
body-composition report and turn your measurements into an interactive body."*, primary
CTA **Upload report**. Accept PDF, JPG, PNG — but only PDF needs to parse in this stage;
images are stored and routed to manual entry.

Store the original file verbatim as a Blob. It must remain downloadable forever.

### 2. Parser

Deterministic extraction targeting this report's layout. For each metric in
`reference/metric-catalog.md`, capture:

- the numeric value
- the unit
- the provider's own classification word (`High`, `Low`, `Normal`, `Healthy`, `Lean`,
  `Average`, `Standard`, whatever the report prints) **verbatim, unaltered**
- the page number it came from
- a reference range **only if the report prints one**

Also extract the profile header: subject name, age, sex, height, measurement date, provider.

Rules:
- Never guess a mapping. Unrecognised labelled values go into `unmapped` with their raw
  label preserved, surfaced under "Other values found".
- Never normalise or translate a classification word.
- Mark any value you are unsure of `confidence: 'low'` so verification can highlight it.

### 3. Processing screen

Staged progress, not a spinner: *Reading your report → Finding measurements →
Understanding categories → Checking dates → Building your profile*. Keep it brief and
restrained.

### 4. Extraction summary

*"We found N measurements"* — **N computed from the parse**, never hardcoded. Break down
by category with real counts.

### 5. Verification screen

A table of every extracted metric: name, value, unit, source classification, page. Every
field editable. Low-confidence rows visibly flagged. Unmapped values in their own section.

If height is missing, require it here — the body cannot be generated without it.

CTA **Confirm & Build My Body**. Secondary: **Edit extracted data**.

On confirm, set `extraction_status: 'verified'` and mark any edited metric
`edited_by_user: true`. Edited values must remain visibly distinguishable from parsed
ones everywhere in the app.

### 6. Profiles and subject detection

Reports belong to a **profile**, not to an implicit single user.

On upload, compare the extracted subject name, age and sex against existing profiles:

- Match → attach the report to that profile.
- No match → *"This report looks like it's for a different person."* Offer **Create a new
  profile** or **Add to \<existing profile\> anyway**. Never merge silently.

A simple profile switcher in the header. Each profile has its own reports, metrics,
snapshots and timeline.

This matters because I will be testing with two real reports from two different people. A
timeline that mixed them would be a false record.

### 7. Persistence

Dexie/IndexedDB, schema per the brief. Reports, metrics, snapshots and profiles survive a
page reload. Provide delete: per report and per profile, removing the stored file and all
derived data.

### 8. Reports view

List of uploaded reports per profile: date, provider, metric count, extraction status, and
**view/download the original file**.

## Acceptance checks

Write these as Vitest tests against the real attached PDF and make them pass:

1. Parsing the reference PDF yields these exact values with these exact classifications:

   | metric | value | unit |
   |---|---|---|
   | `weight` | 54.3 | kg |
   | `bmi` | 19.9 | — |
   | `fat_mass` | 19.3 | kg |
   | `fat_percentage` | 35.6 | % |
   | `skeletal_muscle_mass` | 18.2 | kg |
   | `skeletal_muscle_percentage` | 33.5 | % |
   | `lean_mass` | 34.9 | kg |
   | `lean_mass_percentage` | 59.7 | % |
   | `total_water` | 25.6 | kg |
   | `water_percentage` | 47.2 | % |
   | `health_score` | 65.0 | — |
   | `body_age` | 24 | years |
   | `body_symmetry` | 100.4 | — |
   | `t_score` | 1.4 | — |
   | `z_score` | 0.9 | — |
   | `visceral_fat_mass` | 2.3 | kg |
   | `visceral_fat_level` | 8.0 | — |
   | `heart_rate` | 94 | bpm |

   `body_health_status` = "Unhealthy Signs", `body_type` = "High Body Fat".

   `visceral_fat_mass` carries classification **High** and `visceral_fat_level` carries
   **Low** — both preserved, neither corrected.

   These values come from the product spec. **Verify each against the actual PDF.** If the
   file disagrees with this table, the file wins — tell me which ones differ and correct
   the test.

2. All five regional fat masses, five regional muscle masses and five muscle-to-fat ratios
   extract with their classifications.
3. Profile header extracts: age 26, sex female, measurement date 2026-03-28, provider FITTR.
4. Total extracted metric count is ≥ 40.
5. Reload the page → all data still present.
6. Uploading a report for a different subject triggers the new-profile prompt rather than
   appending to the existing timeline.

## Do not build in this stage

3D anything. Metric explanations. Relationship graph. Conflict detection. Comparison.
Timeline visualisation. Charts.

Report what the parse produced, note anything in the PDF that did not map cleanly, and
stop.
