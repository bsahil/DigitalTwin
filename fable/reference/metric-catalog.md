# Canonical Metric Catalog

Every metric the app understands. `canonical_name` is the storage key and must never
change. `display_name` is what the user sees. Categories drive the extraction summary
counts and the navigation grouping.

Counts shown in the UI must be computed from what was actually extracted from the
uploaded file — never hardcoded.

## body_composition

| canonical_name | display_name | unit | type |
|---|---|---|---|
| `weight` | Weight | kg | number |
| `bmi` | BMI | — | number |
| `fat_mass` | Fat Mass | kg | number |
| `fat_percentage` | Body Fat | % | number |
| `skeletal_muscle_mass` | Skeletal Muscle Mass | kg | number |
| `skeletal_muscle_percentage` | Skeletal Muscle | % | number |
| `lean_mass` | Lean Mass | kg | number |
| `lean_mass_percentage` | Lean Mass | % | number |
| `total_water` | Total Body Water | kg | number |
| `water_percentage` | Body Water | % | number |
| `health_score` | Health Score | — | number |
| `body_health_status` | Body Health Status | — | categorical |
| `body_age` | Body Age | years | number |
| `body_type` | Body Type | — | categorical |
| `body_symmetry` | Body Symmetry | — | number |
| `t_score` | T-Score | — | number |
| `z_score` | Z-Score | — | number |

## fat_distribution

| canonical_name | display_name | unit | type |
|---|---|---|---|
| `subcutaneous_fat_mass` | Subcutaneous Fat Mass | kg | number |
| `subcutaneous_fat_percentage` | Subcutaneous Fat | % | number |
| `visceral_fat_mass` | Visceral Fat Mass | kg | number |
| `visceral_fat_level` | Visceral Fat Level | — | number |
| `trunk_fat_mass` | Trunk Fat | kg | number |
| `left_arm_fat_mass` | Left Arm Fat | kg | number |
| `right_arm_fat_mass` | Right Arm Fat | kg | number |
| `left_leg_fat_mass` | Left Leg Fat | kg | number |
| `right_leg_fat_mass` | Right Leg Fat | kg | number |
| `fat_control` | Fat Control | kg | number |
| `fat_grade` | Fat Grade | — | categorical |
| `trunk_muscle_fat_ratio` | Trunk Muscle-to-Fat Ratio | — | number |
| `left_arm_muscle_fat_ratio` | Left Arm Muscle-to-Fat Ratio | — | number |
| `right_arm_muscle_fat_ratio` | Right Arm Muscle-to-Fat Ratio | — | number |
| `left_leg_muscle_fat_ratio` | Left Leg Muscle-to-Fat Ratio | — | number |
| `right_leg_muscle_fat_ratio` | Right Leg Muscle-to-Fat Ratio | — | number |

## muscle

| canonical_name | display_name | unit | type |
|---|---|---|---|
| `muscle_control` | Muscle Control | kg | number |
| `trunk_muscle_mass` | Trunk Muscle | kg | number |
| `left_arm_muscle_mass` | Left Arm Muscle | kg | number |
| `right_arm_muscle_mass` | Right Arm Muscle | kg | number |
| `left_leg_muscle_mass` | Left Leg Muscle | kg | number |
| `right_leg_muscle_mass` | Right Leg Muscle | kg | number |
| `upper_lower_muscle_balance` | Upper/Lower Muscle Balance | — | categorical |
| `trunk_limb_muscle_balance` | Trunk/Limb Muscle Balance | — | categorical |

## body_water

| canonical_name | display_name | unit | type |
|---|---|---|---|
| `intracellular_water` | Intracellular Water | kg | number |
| `extracellular_water` | Extracellular Water | kg | number |
| `water_balance` | Water Balance | — | number |

## composition_elements

| canonical_name | display_name | unit | type |
|---|---|---|---|
| `protein_mass` | Protein Mass | kg | number |
| `protein_percentage` | Protein | % | number |
| `bone_mass` | Bone Mass | kg | number |
| `mineral` | Mineral | kg | number |
| `body_cell_mass` | Body Cell Mass | kg | number |

## vitals_targets

| canonical_name | display_name | unit | type |
|---|---|---|---|
| `heart_rate` | Heart Rate | bpm | number |
| `bmr` | BMR | kcal | number |
| `recommended_calorie_intake` | Recommended Calorie Intake | kcal | number |
| `ideal_weight` | Ideal Weight | kg | number |
| `weight_control` | Weight Control | kg | number |
| `fat_free_mass` | Fat-Free Mass | kg | number |

## profile fields (not metrics)

Extracted from the report header, stored on the profile, used for subject matching:

`subject_name`, `age`, `sex`, `height`, `measurement_date`, `provider`

## Handling unknown fields

If the parser encounters a labelled value that maps to no canonical name, store it as an
`unmapped` metric with its raw label preserved and show it in a separate "Other values
found" group on the verification screen. Never discard it, and never guess a mapping.
