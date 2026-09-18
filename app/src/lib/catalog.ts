export type Category =
  | 'body_composition'
  | 'fat_distribution'
  | 'muscle'
  | 'body_water'
  | 'composition_elements'
  | 'vitals_targets';

export type Provenance = 'measured' | 'derived' | 'interpreted' | 'illustrative';

export interface CatalogEntry {
  canonical_name: string;
  label: string;
  display_name: string;
  unit: string | null;
  category: Category;
  categorical?: boolean;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  body_composition: 'Body Composition',
  fat_distribution: 'Fat Distribution',
  muscle: 'Muscle',
  body_water: 'Body Water',
  composition_elements: 'Composition',
  vitals_targets: 'Vitals & Targets',
};

const e = (
  canonical_name: string,
  label: string,
  display_name: string,
  unit: string | null,
  category: Category,
  categorical = false,
): CatalogEntry => ({ canonical_name, label, display_name, unit, category, categorical });

export const CATALOG: CatalogEntry[] = [
  e('weight', 'Weight', 'Weight', 'kg', 'body_composition'),
  e('bmi', 'Body Mass Index (BMI)', 'BMI', null, 'body_composition'),
  e('fat_mass', 'Fat mass', 'Fat Mass', 'kg', 'body_composition'),
  e('fat_percentage', 'Fat percentage', 'Body Fat', '%', 'body_composition'),
  e('skeletal_muscle_mass', 'Skeletal muscle mass', 'Skeletal Muscle Mass', 'kg', 'body_composition'),
  e('skeletal_muscle_percentage', 'Skeletal muscle percentage', 'Skeletal Muscle', '%', 'body_composition'),
  e('lean_mass', 'Lean mass', 'Lean Mass', 'kg', 'body_composition'),
  e('lean_mass_percentage', 'Lean mass percentage', 'Lean Mass Percentage', '%', 'body_composition'),
  e('total_water', 'Total water', 'Total Body Water', 'kg', 'body_composition'),
  e('water_percentage', 'Water percentage', 'Body Water', '%', 'body_composition'),
  e('health_score', 'Health score', 'Health Score', 'points', 'body_composition'),
  e('body_health_status', 'Body health status', 'Body Health Status', null, 'body_composition', true),
  e('body_age', 'Body age', 'Body Age', 'years', 'body_composition'),
  e('body_type', 'Body type', 'Body Type', null, 'body_composition', true),
  e('body_symmetry', 'Body symmetry', 'Body Symmetry', null, 'body_composition'),
  e('t_score', 'T score', 'T-Score', null, 'body_composition'),
  e('z_score', 'Z score', 'Z-Score', null, 'body_composition'),

  e('subcutaneous_fat_mass', 'Subcutaneous fat mass', 'Subcutaneous Fat Mass', 'kg', 'fat_distribution'),
  e('subcutaneous_fat_percentage', 'Subcutaneous fat percentage', 'Subcutaneous Fat', '%', 'fat_distribution'),
  e('visceral_fat_mass', 'Visceral fat mass', 'Visceral Fat Mass', 'kg', 'fat_distribution'),
  e('visceral_fat_level', 'Visceral fat level', 'Visceral Fat Level', null, 'fat_distribution'),
  e('trunk_fat_mass', 'Trunk fat mass', 'Trunk Fat', 'kg', 'fat_distribution'),
  e('left_arm_fat_mass', 'Left arm fat mass', 'Left Arm Fat', 'kg', 'fat_distribution'),
  e('right_arm_fat_mass', 'Right arm fat mass', 'Right Arm Fat', 'kg', 'fat_distribution'),
  e('left_leg_fat_mass', 'Left leg fat mass', 'Left Leg Fat', 'kg', 'fat_distribution'),
  e('right_leg_fat_mass', 'Right leg fat mass', 'Right Leg Fat', 'kg', 'fat_distribution'),
  e('fat_control', 'Fat control', 'Fat Control', 'kg', 'fat_distribution'),
  e('fat_grade', 'Fat grade', 'Fat Grade', null, 'fat_distribution', true),
  e('left_arm_muscle_fat_ratio', 'Left arm muscle to fat ratio', 'Left Arm Muscle-to-Fat Ratio', null, 'fat_distribution'),
  e('left_leg_muscle_fat_ratio', 'Left leg muscle to fat ratio', 'Left Leg Muscle-to-Fat Ratio', null, 'fat_distribution'),
  e('right_arm_muscle_fat_ratio', 'Right arm muscle to fat ratio', 'Right Arm Muscle-to-Fat Ratio', null, 'fat_distribution'),
  e('right_leg_muscle_fat_ratio', 'Right leg muscle to fat ratio', 'Right Leg Muscle-to-Fat Ratio', null, 'fat_distribution'),
  e('trunk_muscle_fat_ratio', 'Trunk muscle to fat ratio', 'Trunk Muscle-to-Fat Ratio', null, 'fat_distribution'),

  e('muscle_control', 'Muscle control', 'Muscle Control', 'kg', 'muscle'),
  e('left_arm_muscle_mass', 'Left arm muscle mass', 'Left Arm Muscle', 'kg', 'muscle'),
  e('right_arm_muscle_mass', 'Right arm muscle mass', 'Right Arm Muscle', 'kg', 'muscle'),
  e('left_leg_muscle_mass', 'Left leg muscle mass', 'Left Leg Muscle', 'kg', 'muscle'),
  e('right_leg_muscle_mass', 'Right leg muscle mass', 'Right Leg Muscle', 'kg', 'muscle'),
  e('trunk_muscle_mass', 'Trunk muscle mass', 'Trunk Muscle', 'kg', 'muscle'),
  e('upper_lower_muscle_balance', 'Upper lower muscle balance', 'Upper/Lower Muscle Balance', null, 'muscle'),
  e('trunk_limb_muscle_balance', 'Trunk limb muscle balance', 'Trunk/Limb Muscle Balance', null, 'muscle'),

  e('intracellular_water', 'Intracellular water', 'Intracellular Water', 'kg', 'body_water'),
  e('extracellular_water', 'Extracellular water', 'Extracellular Water', 'kg', 'body_water'),
  e('water_balance', 'Water balance', 'Water Balance', null, 'body_water'),

  e('protein_mass', 'Protein mass', 'Protein Mass', 'kg', 'composition_elements'),
  e('protein_percentage', 'Protein percentage', 'Protein', '%', 'composition_elements'),
  e('bone_mass', 'Bone mass', 'Bone Mass', 'kg', 'composition_elements'),
  e('mineral', 'Mineral', 'Mineral', 'kg', 'composition_elements'),
  e('body_cell_mass', 'Body cell mass', 'Body Cell Mass', 'kg', 'composition_elements'),

  e('heart_rate', 'Heart rate', 'Heart Rate', 'bpm', 'vitals_targets'),
  e('bmr', 'Basal Metabolic Rate (BMR)', 'BMR', 'kcal', 'vitals_targets'),
  e('recommended_calorie_intake', 'Recommended calorie intake', 'Recommended Calorie Intake', 'kcal', 'vitals_targets'),
  e('ideal_weight', 'Ideal weight', 'Ideal Weight', 'kg', 'vitals_targets'),
  e('weight_control', 'Weight control', 'Weight Control', 'kg', 'vitals_targets'),
  e('fat_free_mass', 'Fat free mass', 'Fat-Free Mass', 'kg', 'vitals_targets'),
];

export const BY_LABEL = new Map(CATALOG.map((c) => [c.label, c]));
export const BY_NAME = new Map(CATALOG.map((c) => [c.canonical_name, c]));

/** Catalog position, so stored metrics display in report order rather than index order. */
export const ORDER = new Map(CATALOG.map((c, i) => [c.canonical_name, i]));
export const byCatalogOrder = (a: { canonical_name: string }, b: { canonical_name: string }) =>
  (ORDER.get(a.canonical_name) ?? 999) - (ORDER.get(b.canonical_name) ?? 999);

/** Units seen in the source reports. Used to disambiguate optional unit cells. */
export const UNITS = new Set(['kg', '%', 'points', 'years', 'bpm', 'kcal']);

/** Section headings, in document order, mapping to the category that follows. */
export const SECTION_HEADINGS: Record<string, Category> = {
  'Overall Body Composition': 'body_composition',
  'Fat Distribution and Control': 'fat_distribution',
  'Muscle Mass and Control': 'muscle',
  'Body Water Levels': 'body_water',
  'Body Composition Elements': 'composition_elements',
  'Vital Signs & Fitness Goals': 'vitals_targets',
};
