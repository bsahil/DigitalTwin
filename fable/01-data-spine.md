# Stage 1 — Data Spine

**Goal:** a real PDF goes in, correct verified metrics come out and persist. No 3D yet.

Nothing later works if this stage is wrong, so it is first and it is tested.

---

## Before you write code

Two real FITTR reports are attached. **Both have a genuine text layer** — this has been
verified, and a prototype parser has already extracted 55/55 metrics from Report A and
54/55 from Report B. No OCR is needed.

`reference/metric-catalog.md` contains the exact label strings, the parsing quirks and the
status vocabulary as they actually appear in the files. Follow it rather than inferring
structure.

The two reports are **different people, both dated 28/03/2026** — not a longitudinal pair.
They test the parser twice and exercise profile separation. They cannot demonstrate change
over time; nothing in the build should assume they can.

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

Height is not printed in these reports. Derive it as `sqrt(weight / bmi)`, pre-fill it
tagged `derived`, and ask the user to confirm or correct. Do not block on it and do not
show it as measured.

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

Write these as Vitest tests against the real attached PDFs. **These values are verified
extractions, not estimates** — the tests must pass exactly.

### Report A — "g", 26, Female, 28/03/2026 — all 55 metrics

| metric | value | unit | status |
|---|---|---|---|
| `weight` | 54.3 | kg | Normal |
| `bmi` | 19.9 | — | Normal |
| `fat_mass` | 19.3 | kg | Normal |
| `fat_percentage` | 35.6 | % | High |
| `skeletal_muscle_mass` | 18.2 | kg | Lean |
| `skeletal_muscle_percentage` | 33.5 | % | Normal |
| `lean_mass` | 34.9 | kg | Healthy |
| `lean_mass_percentage` | 59.7 | % | Average |
| `total_water` | 25.6 | kg | Low |
| `water_percentage` | 47.2 | % | Low |
| `health_score` | 65.0 | points | *(none)* |
| `body_health_status` | "Unhealthy Signs" | — | *(none)* |
| `body_age` | 24.0 | years | *(none)* |
| `body_type` | "High Body Fat" | — | *(none)* |
| `body_symmetry` | 100.4 | — | *(none)* |
| `t_score` | 1.4 | — | Normal |
| `z_score` | 0.9 | — | *(none)* |
| `subcutaneous_fat_mass` | 17.0 | kg | Normal |
| `subcutaneous_fat_percentage` | 31.3 | % | Overweight |
| `visceral_fat_mass` | 2.3 | kg | High |
| `visceral_fat_level` | 8.0 | — | Low |
| `trunk_fat_mass` | 9.8 | kg | Overweight |
| `left_arm_fat_mass` | 1.0 | kg | Low |
| `right_arm_fat_mass` | 1.1 | kg | Low |
| `left_leg_fat_mass` | 2.5 | kg | Normal |
| `right_leg_fat_mass` | 2.6 | kg | Normal |
| `fat_control` | **-6.1** | kg | *(none)* |
| `fat_grade` | "Healthy" | — | *(none)* |
| `left_arm_muscle_fat_ratio` | 1.7 | — | Low |
| `left_leg_muscle_fat_ratio` | 2.2 | — | Normal |
| `right_arm_muscle_fat_ratio` | 1.5 | — | Low |
| `right_leg_muscle_fat_ratio` | 2.0 | — | Low |
| `trunk_muscle_fat_ratio` | 1.6 | — | Low |
| `muscle_control` | 9.1 | kg | Low |
| `left_arm_muscle_mass` | 1.7 | kg | Lean |
| `right_arm_muscle_mass` | 1.6 | kg | Lean |
| `left_leg_muscle_mass` | 5.5 | kg | Healthy |
| `right_leg_muscle_mass` | 5.2 | kg | Healthy |
| `trunk_muscle_mass` | 15.5 | kg | Lean |
| `upper_lower_muscle_balance` | 1.8 | — | Balanced |
| `trunk_limb_muscle_balance` | 1.1 | — | Balanced |
| `intracellular_water` | 16.0 | kg | Low |
| `extracellular_water` | 9.5 | kg | Low |
| `water_balance` | 1.7 | — | Low |
| `protein_mass` | 6.8 | kg | Low |
| `protein_percentage` | 12.5 | % | Low |
| `bone_mass` | 2.0 | kg | Low |
| `mineral` | 2.5 | kg | *(none)* |
| `body_cell_mass` | 22.9 | kg | Normal |
| `heart_rate` | 94.0 | bpm | High |
| `bmr` | 1123.0 | kcal | Very Low |
| `recommended_calorie_intake` | 1459.0 | kcal | *(none)* |
| `ideal_weight` | 57.2 | kg | *(none)* |
| `weight_control` | 3.0 | kg | *(none)* |
| `fat_free_mass` | 34.9 | kg | Low |

Derived height: **165.2 cm**.

### Report B — "Sahil", 27, Male, 28/03/2026 — 54 metrics

Spot-check these, and assert the count and the absence:

`weight` 73.0 Normal · `bmi` 23.0 Normal · `fat_mass` 13.6 Normal · `fat_percentage` 18.6
Normal · `lean_mass` 59.4 **Athletic** · `fat_free_mass` 59.4 **Low** · `body_type`
"Balanced Build" · `body_health_status` "Moderate health" · `body_symmetry` 96.7
**Symmetric** · `trunk_limb_muscle_balance` 1.0 **"Mild Asymmetry"** · `weight_control`
**-3.1** · `heart_rate` 107.0 High · `protein_percentage` 16.1 **(no status)**

Derived height: **178.2 cm**.

**`muscle_control` must be absent** — assert it is not present, and that the app reports
54 rather than falling back to a template count.

### Also

1. Profile headers parse from the letter-spaced page 1: name, age, sex, date 2026-03-28,
   provider FITTR.
2. Counts by category are computed, never hardcoded.
3. Reload the page → all data still present.
4. Uploading Report B while Report A's profile is active triggers the different-subject
   prompt rather than appending to A's timeline.
5. Negative values (`fat_control` -6.1, `weight_control` -3.1) round-trip with sign intact.

## Do not build in this stage

3D anything. Metric explanations. Relationship graph. Conflict detection. Comparison.
Timeline visualisation. Charts.

Report what the parse produced, note anything in the PDF that did not map cleanly, and
stop.
