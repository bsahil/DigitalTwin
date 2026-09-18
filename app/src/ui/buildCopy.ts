/**
 * Every string the questionnaire shows. Kept in one place so the forbidden-phrase lint
 * can read all of it: nothing here judges a body, names a threshold, or advises.
 */
export const BUILD_COPY = {
  title: 'Build my body',
  intro:
    'Four answers give a body that looks like you in size and build. Each extra detail you add makes it closer. Nothing leaves this device.',
  level1: {
    heading: 'The basics',
    note: 'Sex, age, height and weight set the size and build. Body fat will be estimated from these with a named published formula until you enter it yourself.',
    name: 'What should we call this body?',
    namePlaceholder: 'A name or a nickname',
    sex: 'Sex',
    sexOptions: [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
      { value: 'other', label: 'Prefer not to say' },
    ] as const,
    sexOtherNote: 'Shown as a neutral blend of the two template bodies.',
    age: 'Age',
    height: 'Height (cm)',
    weight: 'Weight (kg)',
    skinTone: 'Skin tone for the picture',
  },
  level2: {
    heading: 'Add detail',
    note: 'A body-fat figure from a scale or a scan, and a tape around the waist and hips, set how the body is built rather than just how big it is.',
    fat: 'Body fat (%)',
    fatEmpty: 'Leave empty to use the estimate.',
    waist: 'Waist (cm)',
    hip: 'Hips (cm)',
    tapeNote: 'Tape flat against the skin, at the narrowest point for the waist and the widest for the hips.',
  },
  level3: {
    heading: 'More detail',
    note: 'Chest, upper arms and thighs, measured with a tape. Left and right can differ; the figure will too.',
    chest: 'Chest (cm)',
    leftArm: 'Left upper arm (cm)',
    rightArm: 'Right upper arm (cm)',
    leftThigh: 'Left thigh (cm)',
    rightThigh: 'Right thigh (cm)',
    upload: 'Or upload a body-composition report instead',
    uploadNote: 'A report gives fat and muscle for each region, which a tape cannot.',
  },
  submit: 'Show my body',
  addDetail: 'Add detail',
  lessDetail: 'Hide',
  summary: {
    typed: 'Shown as self-reported: ',
    estimated: 'Shown as estimated with the Deurenberg (1991) formula: ',
    derived: 'Calculated from those: ',
  },
  validation: {
    name: 'A name helps you tell profiles apart.',
    age: 'Age between 18 and 100.',
    height: 'Height between 120 and 230 cm.',
    weight: 'Weight between 30 and 300 kg.',
    fat: 'Body fat between 3 and 60 %.',
    tape: 'Between 20 and 200 cm.',
  },
  metricNotes: {
    estimated:
      'Estimated from your BMI, age and sex with the Deurenberg (1991) equation — a published population formula, not a measurement of you. Individual bodies differ from it by several percentage points either way.',
    self_reported: 'You entered this value yourself. It is shown exactly as typed.',
  },
} as const;
