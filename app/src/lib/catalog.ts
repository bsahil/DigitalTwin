export type Category =
  | 'body_composition'
  | 'fat_distribution'
  | 'muscle'
  | 'body_water'
  | 'composition_elements'
  | 'vitals_targets';

/**
 * measured/derived/interpreted describe a provider's numbers; illustrative marks what the
 * app draws without data; self_reported and estimated exist for the questionnaire path:
 * a value the person typed, or one computed from what they typed by a named formula.
 */
export type Provenance = 'measured' | 'derived' | 'interpreted' | 'illustrative' | 'self_reported' | 'estimated';

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
  // Tape measurements exist only for the questionnaire path; no report the parser knows lists them.
  e('waist_circumference', 'Waist circumference', 'Waist', 'cm', 'fat_distribution'),
  e('hip_circumference', 'Hip circumference', 'Hips', 'cm', 'fat_distribution'),
  e('chest_circumference', 'Chest circumference', 'Chest', 'cm', 'body_composition'),
  e('left_upper_arm_circumference', 'Left upper arm circumference', 'Left Upper Arm', 'cm', 'muscle'),
  e('right_upper_arm_circumference', 'Right upper arm circumference', 'Right Upper Arm', 'cm', 'muscle'),
  e('left_thigh_circumference', 'Left thigh circumference', 'Left Thigh', 'cm', 'muscle'),
  e('right_thigh_circumference', 'Right thigh circumference', 'Right Thigh', 'cm', 'muscle'),
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
export const UNITS = new Set(['kg', '%', 'points', 'years', 'bpm', 'kcal', 'cm']);

/** Section headings, in document order, mapping to the category that follows. */
export const SECTION_HEADINGS: Record<string, Category> = {
  'Overall Body Composition': 'body_composition',
  'Fat Distribution and Control': 'fat_distribution',
  'Muscle Mass and Control': 'muscle',
  'Body Water Levels': 'body_water',
  'Body Composition Elements': 'composition_elements',
  'Vital Signs & Fitness Goals': 'vitals_targets',
};

/**
 * Where each value comes from. On a bioimpedance scan nothing is physically measured:
 * "measured" means the device reported it as a primary estimate; "derived" is
 * arithmetic on other reported values; "interpreted" is the provider's own judgement
 * against a methodology the report does not state. Every catalog metric is listed
 * explicitly — a test forbids falling through to a default.
 */
export const PROVENANCE: Record<string, Provenance> = {
  weight: 'measured',
  fat_mass: 'measured',
  skeletal_muscle_mass: 'measured',
  lean_mass: 'measured',
  total_water: 'measured',
  intracellular_water: 'measured',
  extracellular_water: 'measured',
  subcutaneous_fat_mass: 'measured',
  visceral_fat_mass: 'measured',
  trunk_fat_mass: 'measured',
  left_arm_fat_mass: 'measured',
  right_arm_fat_mass: 'measured',
  left_leg_fat_mass: 'measured',
  right_leg_fat_mass: 'measured',
  trunk_muscle_mass: 'measured',
  left_arm_muscle_mass: 'measured',
  right_arm_muscle_mass: 'measured',
  left_leg_muscle_mass: 'measured',
  right_leg_muscle_mass: 'measured',
  protein_mass: 'measured',
  bone_mass: 'measured',
  mineral: 'measured',
  body_cell_mass: 'measured',
  heart_rate: 'measured',

  bmi: 'derived',
  fat_percentage: 'derived',
  skeletal_muscle_percentage: 'derived',
  lean_mass_percentage: 'derived',
  water_percentage: 'derived',
  subcutaneous_fat_percentage: 'derived',
  protein_percentage: 'derived',
  trunk_muscle_fat_ratio: 'derived',
  left_arm_muscle_fat_ratio: 'derived',
  right_arm_muscle_fat_ratio: 'derived',
  left_leg_muscle_fat_ratio: 'derived',
  right_leg_muscle_fat_ratio: 'derived',
  fat_control: 'derived',
  muscle_control: 'derived',
  weight_control: 'derived',
  ideal_weight: 'derived',
  fat_free_mass: 'derived',
  bmr: 'derived',
  recommended_calorie_intake: 'derived',

  health_score: 'interpreted',
  body_health_status: 'interpreted',
  body_age: 'interpreted',
  body_type: 'interpreted',
  fat_grade: 'interpreted',
  upper_lower_muscle_balance: 'interpreted',
  trunk_limb_muscle_balance: 'interpreted',
  body_symmetry: 'interpreted',
  t_score: 'interpreted',
  z_score: 'interpreted',
  water_balance: 'interpreted',
  visceral_fat_level: 'interpreted',
  waist_circumference: 'measured',
  hip_circumference: 'measured',
  chest_circumference: 'measured',
  left_upper_arm_circumference: 'measured',
  right_upper_arm_circumference: 'measured',
  left_thigh_circumference: 'measured',
  right_thigh_circumference: 'measured',
};

/** Read provenance from the catalog, never from a stored row — rows written before this existed all say "measured". */
export const provenanceFor = (canonicalName: string): Provenance =>
  PROVENANCE[canonicalName] ?? 'measured';

/**
 * A stored row wins only when it says the person typed the value or it was estimated
 * from what they typed; anything else defers to the catalog, so old rows that all say
 * "measured" are still corrected.
 */
export const effectiveProvenance = (row: { canonical_name: string; provenance?: Provenance }): Provenance =>
  row.provenance === 'self_reported' || row.provenance === 'estimated' ? row.provenance : provenanceFor(row.canonical_name);

/** What each derived value is calculated from, so the panel can say so rather than imply a measurement. */
export const DERIVED_FROM: Record<string, string[]> = {
  bmi: ['weight'],
  fat_percentage: ['fat_mass', 'weight'],
  skeletal_muscle_percentage: ['skeletal_muscle_mass', 'weight'],
  lean_mass_percentage: ['lean_mass', 'weight'],
  water_percentage: ['total_water', 'weight'],
  subcutaneous_fat_percentage: ['subcutaneous_fat_mass', 'weight'],
  protein_percentage: ['protein_mass', 'weight'],
  trunk_muscle_fat_ratio: ['trunk_muscle_mass', 'trunk_fat_mass'],
  left_arm_muscle_fat_ratio: ['left_arm_muscle_mass', 'left_arm_fat_mass'],
  right_arm_muscle_fat_ratio: ['right_arm_muscle_mass', 'right_arm_fat_mass'],
  left_leg_muscle_fat_ratio: ['left_leg_muscle_mass', 'left_leg_fat_mass'],
  right_leg_muscle_fat_ratio: ['right_leg_muscle_mass', 'right_leg_fat_mass'],
  fat_control: ['fat_mass'],
  muscle_control: ['skeletal_muscle_mass'],
  weight_control: ['weight', 'ideal_weight'],
  ideal_weight: ['weight', 'bmi'],
  fat_free_mass: ['weight', 'fat_mass'],
  bmr: ['fat_free_mass'],
  recommended_calorie_intake: ['bmr'],
};
