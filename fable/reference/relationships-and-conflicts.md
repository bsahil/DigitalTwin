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
Two metrics in the same cluster carry opposing source classifications (one `High`, one `Low`).
> Example in the reference report: `visceral_fat_mass` = 2.3 kg (High) while
> `visceral_fat_level` = 8.0 (Low).

Copy: *"Your report gives different classifications for two related measurements. Both are
shown exactly as they appear in your report. These metrics may use different scales or
definitions."*

### R2 — summary contradicts detail
A summary/critical-findings statement classifies a family as normal while detail metrics in
that family are classified otherwise.
> Example: body water percentage reported as within normal range while intracellular water,
> extracellular water and water balance are each marked low.

### R3 — BMI vs body fat divergence
`bmi` classified `Normal` while `fat_percentage` classified `High` (or the reverse).

Copy explains that the two describe different aspects of body composition. No judgement.

### R4 — arithmetic inconsistency
Flag when, beyond a stated tolerance:
- `fat_mass + lean_mass` ≉ `weight` (tolerance 2%)
- `fat_percentage × weight / 100` ≉ `fat_mass` (tolerance 2%)
- `intracellular_water + extracellular_water` ≉ `total_water` (tolerance 3%)
- sum of regional fat ≉ `fat_mass` (tolerance 10%, regions are incomplete by design)

These usually indicate an extraction error rather than a report problem — route the user
back to the verification screen.

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
