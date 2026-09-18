import raw from '../data/metric-knowledge.json';

export interface MetricKnowledge {
  definition: string;
  plain_language: string;
  why_it_matters: string;
  measurement_limitations: string;
  what_could_add_context: string[];
  safety_note?: string;
}

const entries = raw as unknown as Record<string, MetricKnowledge | string>;

export const KNOWLEDGE: Record<string, MetricKnowledge> = Object.fromEntries(
  Object.entries(entries).filter(
    (e): e is [string, MetricKnowledge] => !e[0].startsWith('_') && typeof e[1] === 'object',
  ),
);

export const knowledgeFor = (canonicalName: string): MetricKnowledge | undefined =>
  KNOWLEDGE[canonicalName];

/**
 * Phrases the product must never use. Enforced by a test over the generated content, so
 * a diagnosis or a causal claim cannot reach the UI unnoticed.
 */
export const FORBIDDEN_PHRASES = [
  'you have',
  'this proves',
  'this means you definitely',
  'you are at risk of',
  'you should take',
  'diagnosis',
  'diagnose',
];

/**
 * A fixed graph, not live reasoning. It cannot invent a relationship that does not
 * exist, it is reviewable, and it costs nothing to run.
 */
export interface Cluster {
  id: string;
  title: string;
  why: string;
  members: string[];
}

const REGIONS = ['trunk', 'left_arm', 'right_arm', 'left_leg', 'right_leg'] as const;

const REGION_LABEL: Record<string, string> = {
  trunk: 'Trunk',
  left_arm: 'Left arm',
  right_arm: 'Right arm',
  left_leg: 'Left leg',
  right_leg: 'Right leg',
};

export const CLUSTERS: Cluster[] = [
  {
    id: 'composition_identity',
    title: 'How your weight divides up',
    why: 'These partition total body mass. Fat mass and lean mass should approximately sum to weight, and the percentages are the same division expressed as shares.',
    members: [
      'weight',
      'fat_mass',
      'fat_percentage',
      'lean_mass',
      'lean_mass_percentage',
      'fat_free_mass',
    ],
  },
  {
    id: 'fat_measures',
    title: 'Different ways of measuring fat',
    why: 'Body fat percentage and BMI describe different things. BMI is mass relative to height and does not distinguish fat from muscle.',
    members: ['fat_percentage', 'fat_mass', 'bmi', 'fat_grade', 'fat_control'],
  },
  {
    id: 'fat_compartments',
    title: 'Where the fat sits',
    why: 'Different compartments and scales for fat in and around the torso. Subcutaneous and visceral fat together make up total fat mass.',
    members: [
      'fat_mass',
      'subcutaneous_fat_mass',
      'subcutaneous_fat_percentage',
      'visceral_fat_mass',
      'visceral_fat_level',
      'trunk_fat_mass',
    ],
  },
  {
    id: 'muscle_measures',
    title: 'Muscle and lean tissue',
    why: 'Related tissue measures. Protein and body cell mass are components of lean tissue, and skeletal muscle is a subset of it.',
    members: [
      'skeletal_muscle_mass',
      'skeletal_muscle_percentage',
      'lean_mass',
      'protein_mass',
      'body_cell_mass',
      'muscle_control',
    ],
  },
  {
    id: 'symmetry',
    title: 'Left against right',
    why: 'Left/right and upper/lower comparisons of the same tissue type.',
    members: [
      'left_arm_muscle_mass',
      'right_arm_muscle_mass',
      'left_leg_muscle_mass',
      'right_leg_muscle_mass',
      'left_arm_fat_mass',
      'right_arm_fat_mass',
      'left_leg_fat_mass',
      'right_leg_fat_mass',
      'body_symmetry',
      'upper_lower_muscle_balance',
      'trunk_limb_muscle_balance',
    ],
  },
  {
    id: 'water',
    title: 'Body water',
    why: 'Total body water divided into the compartments inside and outside your cells.',
    members: [
      'total_water',
      'water_percentage',
      'intracellular_water',
      'extracellular_water',
      'water_balance',
    ],
  },
  {
    id: 'skeletal',
    title: 'Bone measures',
    why: 'T-score and Z-score compare the same measurement against different reference groups.',
    members: ['bone_mass', 'mineral', 't_score', 'z_score'],
  },
  {
    id: 'energy',
    title: 'Energy and metabolism',
    why: 'Basal metabolic rate estimates are commonly calculated from fat-free tissue.',
    members: ['bmr', 'lean_mass', 'fat_free_mass', 'recommended_calorie_intake'],
  },
  {
    id: 'targets',
    title: 'Provider-calculated targets',
    why: 'Control values are targets the provider derives from its own reference model, not measurements of your body.',
    members: ['ideal_weight', 'weight_control', 'fat_control', 'muscle_control', 'weight'],
  },
  {
    id: 'provider_scores',
    title: 'Provider summary scores',
    why: 'Summary scores derived by the device manufacturer. Their methodology is defined by the provider.',
    members: ['health_score', 'body_health_status', 'body_age', 'body_type'],
  },
  ...REGIONS.map((region) => ({
    id: `region_${region}`,
    title: `${REGION_LABEL[region]} together`,
    why: 'The ratio is derived from the two masses measured in the same region.',
    members: [`${region}_muscle_mass`, `${region}_fat_mass`, `${region}_muscle_fat_ratio`],
  })),
];

export interface RelatedGroup {
  cluster: Cluster;
  members: string[];
}

/** Clusters this metric belongs to, with the other members of each. */
export function relatedTo(canonicalName: string, available: Set<string>): RelatedGroup[] {
  return CLUSTERS.filter((c) => c.members.includes(canonicalName))
    .map((cluster) => ({
      cluster,
      members: cluster.members.filter((m) => m !== canonicalName && available.has(m)),
    }))
    .filter((g) => g.members.length > 0);
}

/**
 * Measurement families a body-composition scan does not provide. Framed as context that
 * could be added, never as a test someone needs.
 */
export interface MissingMeasurement {
  id: string;
  label: string;
  context: string;
  /** Metrics whose panels should surface this, because it is relevant to them. */
  relevantTo: string[];
}

export const MISSING_DATA: MissingMeasurement[] = [
  {
    id: 'blood_lipids',
    label: 'Blood lipid panel',
    context: 'If you are trying to understand cardiovascular context, cholesterol and triglyceride measurements describe something a body scan cannot.',
    relevantTo: ['visceral_fat_mass', 'visceral_fat_level', 'fat_percentage', 'fat_mass', 'trunk_fat_mass'],
  },
  {
    id: 'blood_glucose',
    label: 'Fasting blood glucose',
    context: 'If you are trying to understand how your body handles sugar, a fasting glucose measurement can provide context this scan does not.',
    relevantTo: ['visceral_fat_mass', 'visceral_fat_level', 'fat_percentage', 'bmi'],
  },
  {
    id: 'hba1c',
    label: 'HbA1c',
    context: 'Reflects average blood sugar over roughly three months, which a single body scan cannot describe.',
    relevantTo: ['visceral_fat_mass', 'fat_percentage', 'body_health_status'],
  },
  {
    id: 'blood_pressure',
    label: 'Blood pressure',
    context: 'A separate measurement of how hard blood pushes against artery walls. This scan records heart rate but not blood pressure.',
    relevantTo: ['heart_rate', 'visceral_fat_mass', 'health_score'],
  },
  {
    id: 'thyroid_panel',
    label: 'Thyroid panel',
    context: 'Thyroid measurements can provide context for metabolic questions that body composition alone cannot answer.',
    relevantTo: ['bmr', 'weight', 'body_cell_mass'],
  },
  {
    id: 'vitamin_d',
    label: 'Vitamin D',
    context: 'Relevant to bone-related questions, and not measured by an impedance scan.',
    relevantTo: ['bone_mass', 't_score', 'z_score', 'mineral'],
  },
  {
    id: 'kidney_function',
    label: 'Kidney function',
    context: 'Fluid distribution can have several explanations. Kidney measurements are one source of additional context.',
    relevantTo: ['extracellular_water', 'water_balance', 'intracellular_water', 'total_water'],
  },
  {
    id: 'dexa',
    label: 'DEXA scan',
    context: 'A clinical scan that measures bone density and body composition directly, rather than estimating from impedance.',
    relevantTo: ['t_score', 'z_score', 'bone_mass', 'fat_percentage', 'visceral_fat_mass'],
  },
  {
    id: 'resting_heart_rate',
    label: 'Resting heart rate over time',
    context: 'A single reading captures one moment. A trend measured consistently describes something one reading cannot.',
    relevantTo: ['heart_rate'],
  },
  {
    id: 'vo2_max',
    label: 'Cardiorespiratory fitness',
    context: 'A measure of how well your body uses oxygen during exercise, which body composition does not capture.',
    relevantTo: ['heart_rate', 'skeletal_muscle_mass', 'health_score'],
  },
];

export const missingFor = (canonicalName: string): MissingMeasurement[] =>
  MISSING_DATA.filter((m) => m.relevantTo.includes(canonicalName));
