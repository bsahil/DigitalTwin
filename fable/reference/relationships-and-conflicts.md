# Relationship Graph & Data Check Rules

Both are **static tables in code**, not live model reasoning. This is deliberate: a fixed
graph is cheap, reproducible, reviewable, and cannot invent a relationship that does not
exist. PRD §5.4 and §21 are satisfied by construction.

## Relationship graph

Undirected edges between canonical metrics. Each edge carries a short `why` string shown
when the user follows it. Group edges into named clusters so "What is it connected to?"
can present them meaningfully.

### Cluster: composition identity
`weight` ↔ `fat_mass` ↔ `lean_mass` ↔ `fat_free_mass`
> These partition total body mass. Fat mass and lean mass should approximately sum to weight.

### Cluster: fat measures
`fat_percentage` ↔ `fat_mass` ↔ `bmi` ↔ `fat_grade` ↔ `fat_control`
> Body fat percentage and BMI describe different things. BMI is mass relative to height and
> does not distinguish fat from muscle.

`subcutaneous_fat_mass` ↔ `visceral_fat_mass` ↔ `visceral_fat_level` ↔ `trunk_fat_mass`
> Different compartments and scales for fat located in and around the trunk.

### Cluster: muscle measures
`skeletal_muscle_mass` ↔ `skeletal_muscle_percentage` ↔ `lean_mass` ↔ `protein_mass` ↔ `body_cell_mass` ↔ `muscle_control`
> Related tissue measures. Protein and body cell mass are components of lean tissue.

### Cluster: regional (one per region: trunk, left_arm, right_arm, left_leg, right_leg)
`<region>_fat_mass` ↔ `<region>_muscle_mass` ↔ `<region>_muscle_fat_ratio`
> The ratio is derived from the two masses in the same region.

### Cluster: symmetry
`left_arm_muscle_mass` ↔ `right_arm_muscle_mass`, `left_leg_muscle_mass` ↔ `right_leg_muscle_mass`,
same for fat, all ↔ `body_symmetry` ↔ `upper_lower_muscle_balance` ↔ `trunk_limb_muscle_balance`
> Left/right and upper/lower comparisons of the same tissue type.

### Cluster: water
`total_water` ↔ `water_percentage` ↔ `intracellular_water` ↔ `extracellular_water` ↔ `water_balance`
> Total body water divided into compartments inside and outside cells.

### Cluster: skeletal
`bone_mass` ↔ `mineral` ↔ `t_score` ↔ `z_score`
> Bone-related measures. T-score and Z-score are comparisons against different reference groups.

### Cluster: energy & targets
`bmr` ↔ `lean_mass` ↔ `fat_free_mass` ↔ `recommended_calorie_intake`
> Basal metabolic rate estimates are commonly calculated from fat-free tissue.

`weight` ↔ `ideal_weight` ↔ `weight_control`; `fat_mass` ↔ `fat_control`; `skeletal_muscle_mass` ↔ `muscle_control`
> Control values are provider-calculated targets, not measurements.

### Cluster: provider scores
`health_score` ↔ `body_health_status` ↔ `body_age` ↔ `body_type`
> Provider-derived summary scores. Their methodology is defined by the device manufacturer.

## Data Check rules

Each rule produces a flag with: the metrics involved, both values with their source
classifications, and neutral explanatory copy. **Never resolve a conflict automatically.**

### R1 — opposing classifications on related metrics
Two metrics in the same cluster carry differing source classifications.

**Confirmed present in the real files** — these are acceptance fixtures, not hypotheticals:

| pair | Report A | Report B |
|---|---|---|
| `lean_mass` vs `fat_free_mass` | 34.9 **Healthy** vs 34.9 **Low** | 59.4 **Athletic** vs 59.4 **Low** |
| `visceral_fat_mass` vs `visceral_fat_level` | 2.3 High vs 8.0 Low | 1.7 Normal vs 6.0 Low |
| `protein_mass` vs `body_cell_mass` | 6.8 Low vs 22.9 Normal | 11.8 Low vs 39.2 High |
| `fat_mass` vs `fat_percentage` | 19.3 Normal vs 35.6 High | — |
| `subcutaneous_fat_mass` vs `subcutaneous_fat_percentage` | 17.0 Normal vs 31.3 Overweight | — |
| `total_water` vs `water_percentage` | — | 43.6 Healthy vs 59.7 Low |

The `lean_mass` / `fat_free_mass` case is the strongest: **the identical number carries
contradictory labels in both reports.** Give it its own presentation — same value, two
classifications — because it demonstrates the product's premise better than any other row.

Copy: *"Your report gives different classifications for two related measurements. Both are
shown exactly as they appear in your report. These metrics may use different scales or
definitions."*

### R2 — summary contradicts detail
A summary/critical-findings statement classifies a family as normal while detail metrics in
that family are classified otherwise. **Both confirmed in the real files:**

- Report A, page 6: *"Body water percentage is within normal range"* — while page 7 marks
  `total_water` **Low** and `water_percentage` **Low**, and page 12 marks all three water
  metrics **Low**. Page 15 repeats the claim in recommendation 5.
- Report A, page 6: *"Your visceral fat level of 8 is within the normal range"* — while
  page 9 classifies `visceral_fat_level` = 8.0 as **Low**. A third classification of the
  same number.
- Report B, page 6: *"visceral fat level of 6 is within the healthy range"* vs page 9
  **Low**.

Match prose claims on pages 5, 6 and 15 against the detail tables for the same metric.

### R3 — BMI vs body fat divergence
`bmi` classified `Normal` while `fat_percentage` classified `High` (or the reverse).

Copy explains that the two describe different aspects of body composition. No judgement.

### R4 — arithmetic inconsistency

All checks below were run against both real files. Results are the expected fixtures.

| check | tol | Report A | Report B |
|---|---|---|---|
| `fat_mass + lean_mass` = `weight` | 2% | ok (0.2%) | ok (0.0%) |
| `fat_percentage × weight` = `fat_mass` | 2% | ok (0.2%) | ok (0.2%) |
| `skeletal_muscle_percentage × weight` = `skeletal_muscle_mass` | 2% | ok (0.1%) | ok (0.2%) |
| `water_percentage × weight` = `total_water` | 2% | ok (0.1%) | ok (0.0%) |
| `intracellular_water + extracellular_water` = `total_water` | 3% | ok (0.4%) | ok (0.2%) |
| `subcutaneous_fat_mass + visceral_fat_mass` = `fat_mass` | 2% | ok (0.0%) | ok (0.0%) |
| **`lean_mass_percentage × weight` = `lean_mass`** | 2% | **FAIL (7.7%)** | **FAIL (7.2%)** |

`lean_mass_percentage` is wrong in both reports — A states 59.7% where the stated masses
give 64.3%, B states 75.9% where they give 81.4%. Every other percentage in both files is
internally exact to within 0.2%. This is a reproducible defect in the provider's template,
not an extraction error.

That distinction matters for how you present R4. An arithmetic flag usually means the
parse went wrong, so the default action is to route the user back to verification. But
when the same check fails identically across reports, it is the source that is
inconsistent. Present this one as a source-data flag and say the original values have been
preserved — do not correct it, and do not recompute the percentage.

Also do **not** check `sum of segmental muscle` against `skeletal_muscle_mass`. They are
different quantities (29.5 vs 18.2 in A) and the check would fire falsely. The segmental
values reconcile with `lean_mass`, minus head, neck, hands and feet.

### R5 — symmetry disagreement
Measured left/right difference exceeds 5% while `body_symmetry` reads within 1 of 100.

## Missing-data registry

A fixed list of measurement families the app knows exist but a body-composition scan does
not provide. Show under "What your scan can't tell you":

`blood_lipids`, `blood_glucose`, `hba1c`, `blood_pressure`, `thyroid_panel`,
`vitamin_d`, `ferritin`, `kidney_function`, `liver_function`, `resting_heart_rate_trend`,
`sleep`, `vo2_max`

Each entry has one line on what kind of context it can add. Framing rule: *"If you're
trying to understand X, this type of measurement can provide additional context"* —
never *"you need test X."*

## Language guardrails

The explanation content and all generated copy must use:
> may · can be associated with · can provide context · worth discussing · additional
> information would be needed

and must never use:
> you have · this proves · this means you definitely · you are at risk of

Implement this as a lint check over the generated knowledge JSON: fail the build if a
forbidden phrase appears in any explanation string.
