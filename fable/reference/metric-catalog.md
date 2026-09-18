# Canonical Metric Catalog

**Verified against both reference PDFs.** The `report label` column is the exact string as
it appears in the FITTR PDF text layer — match on it verbatim.

55 metrics exist in the template. Report A contains all 55; Report B contains 54
(`muscle_control` is absent). **Never assume a fixed row count.**

## Parsing notes (from the real files)

- Table structure per section: header `Metric Name / Value / Unit / Status`, then rows as
  flat sequential lines.
- **Unit and Status are both optional and independently absent.** Parse by matching the
  label against this catalog, then consume value → optional unit → optional status.
  Do not parse positionally.
- Values may be negative (`Fat control` = -6.1).
- Some values are categorical strings in the Value column (`Body health status`,
  `Body type`, `Fat grade`).
- Page 1 header text is letter-spaced (`R e p o r t c r e a t e d o n - 2 8 / 0 3 / 2 0 2 6`).
  Collapse single spaces between non-space characters before matching the date.
- Row terminators to ignore: lines starting `Disclaimer`, bare page numbers, and the
  `<name> | <age> Yrs` running header.

## Status vocabulary observed

`Normal` · `High` · `Low` · `Very Low` · `Lean` · `Healthy` · `Athletic` · `Average` ·
`Overweight` · `Balanced` · `Symmetric` · `Mild Asymmetry` · *(absent)*

Store verbatim. Never map onto a shared scale.

## body_composition

| canonical_name | report label | unit | type |
|---|---|---|---|
| `weight` | Weight | kg | number |
| `bmi` | Body Mass Index (BMI) | — | number |
| `fat_mass` | Fat mass | kg | number |
| `fat_percentage` | Fat percentage | % | number |
| `skeletal_muscle_mass` | Skeletal muscle mass | kg | number |
| `skeletal_muscle_percentage` | Skeletal muscle percentage | % | number |
| `lean_mass` | Lean mass | kg | number |
| `lean_mass_percentage` | Lean mass percentage | % | number |
| `total_water` | Total water | kg | number |
| `water_percentage` | Water percentage | % | number |
| `health_score` | Health score | points | number |
| `body_health_status` | Body health status | — | categorical |
| `body_age` | Body age | years | number |
| `body_type` | Body type | — | categorical |
| `body_symmetry` | Body symmetry | — | number |
| `t_score` | T score | — | number |
| `z_score` | Z score | — | number |

## fat_distribution

| canonical_name | report label | unit | type |
|---|---|---|---|
| `subcutaneous_fat_mass` | Subcutaneous fat mass | kg | number |
| `subcutaneous_fat_percentage` | Subcutaneous fat percentage | % | number |
| `visceral_fat_mass` | Visceral fat mass | kg | number |
| `visceral_fat_level` | Visceral fat level | — | number |
| `trunk_fat_mass` | Trunk fat mass | kg | number |
| `left_arm_fat_mass` | Left arm fat mass | kg | number |
| `right_arm_fat_mass` | Right arm fat mass | kg | number |
| `left_leg_fat_mass` | Left leg fat mass | kg | number |
| `right_leg_fat_mass` | Right leg fat mass | kg | number |
| `fat_control` | Fat control | kg | number (signed) |
| `fat_grade` | Fat grade | — | categorical |
| `left_arm_muscle_fat_ratio` | Left arm muscle to fat ratio | — | number |
| `left_leg_muscle_fat_ratio` | Left leg muscle to fat ratio | — | number |
| `right_arm_muscle_fat_ratio` | Right arm muscle to fat ratio | — | number |
| `right_leg_muscle_fat_ratio` | Right leg muscle to fat ratio | — | number |
| `trunk_muscle_fat_ratio` | Trunk muscle to fat ratio | — | number |

## muscle

| canonical_name | report label | unit | type |
|---|---|---|---|
| `muscle_control` | Muscle control | kg | number — **absent in Report B** |
| `left_arm_muscle_mass` | Left arm muscle mass | kg | number |
| `right_arm_muscle_mass` | Right arm muscle mass | kg | number |
| `left_leg_muscle_mass` | Left leg muscle mass | kg | number |
| `right_leg_muscle_mass` | Right leg muscle mass | kg | number |
| `trunk_muscle_mass` | Trunk muscle mass | kg | number |
| `upper_lower_muscle_balance` | Upper lower muscle balance | — | **number** + status |
| `trunk_limb_muscle_balance` | Trunk limb muscle balance | — | **number** + status |

## body_water

| canonical_name | report label | unit | type |
|---|---|---|---|
| `intracellular_water` | Intracellular water | kg | number |
| `extracellular_water` | Extracellular water | kg | number |
| `water_balance` | Water balance | — | number |

## composition_elements

| canonical_name | report label | unit | type |
|---|---|---|---|
| `protein_mass` | Protein mass | kg | number |
| `protein_percentage` | Protein percentage | % | number |
| `bone_mass` | Bone mass | kg | number |
| `mineral` | Mineral | kg | number |
| `body_cell_mass` | Body cell mass | kg | number |

## vitals_targets

| canonical_name | report label | unit | type |
|---|---|---|---|
| `heart_rate` | Heart rate | bpm | number |
| `bmr` | Basal Metabolic Rate (BMR) | kcal | number |
| `recommended_calorie_intake` | Recommended calorie intake | kcal | number |
| `ideal_weight` | Ideal weight | kg | number |
| `weight_control` | Weight control | kg | number (signed) |
| `fat_free_mass` | Fat free mass | kg | number |

## Profile fields

From page 1: `subject_name`, `age`, `sex`, `measurement_date`, `provider` (FITTR).

**Height is not printed anywhere in the report.** It is derived:

```
height_m = sqrt(weight_kg / bmi)
```

Verified: Report A → 165.2 cm, Report B → 178.2 cm. Both plausible.

Pre-fill this at verification tagged `derived`, and let the user confirm or correct it.
Do not block the build on it, and do not present it as measured.

## Unknown fields

A labelled value matching no canonical name is stored as `unmapped` with its raw label,
shown under "Other values found". Never discarded, never guessed at.
