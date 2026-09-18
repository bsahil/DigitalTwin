/**
 * Turns measurements into morph-target weights for the realistic body.
 *
 * The honest claim this file has to keep: every measured region is drawn at the
 * volume its measured fat and muscle imply, and the whole body at the volume the
 * weight and body fat imply. Everything else — face, proportions, where inside a
 * region the volume sits — is MakeHuman's template, and is declared as such.
 */
import type { BodyModel, MetricValues, RegionId } from './bodyModel';
import type { HumanMesh, Measurement, TargetWeights } from './humanMesh';
import type { Provenance } from './catalog';

export interface MacroParams {
  /** 0 female … 1 male; 0.5 is a neutral blend. */
  gender: number;
  /** 0 = 25 years, 1 = 90 years. */
  age: number;
  /** MakeHuman weight axis, 0.5 = the template's average. */
  size: number;
  /** MakeHuman muscle axis, 0.5 = average. */
  muscle: number;
}

/** Signed detail parameters, −1..1; each drives a decr/incr target pair. */
export interface DetailParams {
  limbs: Record<'left_arm' | 'right_arm' | 'left_leg' | 'right_leg', { fat: number; muscle: number }>;
  trunk: { horiz: number; depth: number; tone: number; vshape: number; pectoral: number; hip: number; buttocks: number };
}

export interface FitParams extends MacroParams {
  detail: DetailParams;
}

/** Weights for the gender/age/size/muscle macro axes, MakeHuman-style. */
export function macroWeights(p: MacroParams): TargetWeights {
  const w: TargetWeights = {};
  const g = clamp(p.gender, 0, 1), a = clamp(p.age, 0, 1);
  const genders: [string, number][] = [['female', 1 - g], ['male', g]];
  for (const [name, gw] of genders) {
    if (gw <= 0) continue;
    w[`macro-${name}-young`] = gw * (1 - a);
    w[`macro-${name}-old`] = gw * a;
    const s = clamp(p.size, 0, 1), m = clamp(p.muscle, 0, 1);
    if (s < 0.5) w[`weight-${name}-min`] = gw * (1 - 2 * s);
    if (s > 0.5) w[`weight-${name}-max`] = gw * (2 * s - 1);
    if (m < 0.5) w[`muscle-${name}-min`] = gw * (1 - 2 * m);
    if (m > 0.5) w[`muscle-${name}-max`] = gw * (2 * m - 1);
  }
  return w;
}

const LIMB_PARTS: Record<keyof DetailParams['limbs'], [string, string[]]> = {
  left_arm: ['l', ['upperarm', 'lowerarm']],
  right_arm: ['r', ['upperarm', 'lowerarm']],
  left_leg: ['l', ['upperleg', 'lowerleg']],
  right_leg: ['r', ['upperleg', 'lowerleg']],
};

function pair(w: TargetWeights, name: string, k: number) {
  if (k > 0) w[`${name}-incr`] = k;
  else if (k < 0) w[`${name}-decr`] = -k;
}

export function detailWeights(d: DetailParams): TargetWeights {
  const w: TargetWeights = {};
  for (const [limb, { fat, muscle }] of Object.entries(d.limbs) as [keyof DetailParams['limbs'], { fat: number; muscle: number }][]) {
    const [side, parts] = LIMB_PARTS[limb];
    for (const part of parts) {
      pair(w, `${side}-${part}-fat`, clamp(fat, -1, 1));
      pair(w, `${side}-${part}-muscle`, clamp(muscle, -1, 1));
    }
  }
  const t = d.trunk;
  pair(w, 'torso-scale-horiz', clamp(t.horiz, -1, 1));
  pair(w, 'torso-scale-depth', clamp(t.depth, -1, 1));
  pair(w, 'stomach-tone', clamp(t.tone, -1, 1));
  pair(w, 'torso-vshape', clamp(t.vshape, -1, 1));
  pair(w, 'torso-muscle-pectoral', clamp(t.pectoral, -1, 1));
  pair(w, 'hip-scale-horiz', clamp(t.hip, -1, 1));
  pair(w, 'buttocks-volume', clamp(t.buttocks, -1, 1));
  return w;
}

export function allWeights(p: FitParams): TargetWeights {
  return { ...macroWeights(p), ...detailWeights(p.detail) };
}

export const emptyDetail = (): DetailParams => ({
  limbs: {
    left_arm: { fat: 0, muscle: 0 },
    right_arm: { fat: 0, muscle: 0 },
    left_leg: { fat: 0, muscle: 0 },
    right_leg: { fat: 0, muscle: 0 },
  },
  trunk: { horiz: 0, depth: 0, tone: 0, vshape: 0, pectoral: 0, hip: 0, buttocks: 0 },
});

// ---------------------------------------------------------------------------
// Inputs

export type MeasuredRegion = 'trunk' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';
export type SliceId = 'waist' | 'hip' | 'chest' | 'left_upper_arm' | 'right_upper_arm' | 'left_thigh' | 'right_thigh';

export interface FitInput {
  gender: number;
  age: number | null;
  heightM: number;
  /** Whole-body volume the weight and body fat imply (Siri), litres. */
  totalVolumeL: number | null;
  /** Fat volume ÷ total volume, 0..1, when body fat is known. */
  fatVolumeFraction: number | null;
  /** Skeletal muscle mass ÷ weight, when known. */
  muscleFraction: number | null;
  /** Measured regions: the volume their fat + muscle masses imply, and the fat share of it. */
  regions: Partial<Record<MeasuredRegion, { volumeL: number; fatShare: number }>>;
  /** Tape measurements, metres. */
  circumferencesM: Partial<Record<SliceId, number>>;
  /** How the inputs were obtained; shapes the wording of the claims. */
  source: 'report' | 'self_report';
}

export function genderFromSex(sex: string | null | undefined): number {
  if (!sex) return 0.5;
  if (/^f/i.test(sex)) return 0;
  if (/^m/i.test(sex)) return 1;
  return 0.5;
}

export function ageParam(age: number | null | undefined): number {
  if (age == null) return 0;
  return clamp((age - 25) / 65, 0, 1);
}

/** The template's own skeletal-muscle fraction at muscle = 0.5, used to centre the axis. */
const TEMPLATE_MUSCLE_FRACTION = 0.34;

export function fitInputFromModel(
  model: BodyModel,
  profile: { sex: string | null; age: number | null },
  metrics: MetricValues,
  source: FitInput['source'] = 'report',
): FitInput {
  const regions: FitInput['regions'] = {};
  for (const s of model.segments) {
    if (!s.measured) continue;
    if (s.id === 'trunk' || s.id === 'left_arm' || s.id === 'right_arm' || s.id === 'left_leg' || s.id === 'right_leg') {
      regions[s.id] = { volumeL: s.volumeL, fatShare: s.fatShare };
    }
  }
  const weight = metrics.weight ?? null;
  const fatMass = metrics.fat_mass ?? (weight != null && metrics.fat_percentage != null ? (weight * metrics.fat_percentage) / 100 : null);
  const circumferencesM: FitInput['circumferencesM'] = {};
  const tape: [SliceId, string][] = [
    ['waist', 'waist_circumference'], ['hip', 'hip_circumference'], ['chest', 'chest_circumference'],
    ['left_upper_arm', 'left_upper_arm_circumference'], ['right_upper_arm', 'right_upper_arm_circumference'],
    ['left_thigh', 'left_thigh_circumference'], ['right_thigh', 'right_thigh_circumference'],
  ];
  for (const [id, name] of tape) if (metrics[name] != null) circumferencesM[id] = metrics[name] / 100;
  return {
    gender: genderFromSex(profile.sex),
    age: profile.age,
    heightM: model.heightM,
    totalVolumeL: model.totalBodyVolumeL > 0 ? model.totalBodyVolumeL : null,
    fatVolumeFraction: fatMass != null && model.totalBodyVolumeL > 0 ? fatMass / 0.9 / model.totalBodyVolumeL : null,
    muscleFraction: weight && metrics.skeletal_muscle_mass != null ? metrics.skeletal_muscle_mass / weight : null,
    regions,
    circumferencesM,
    source,
  };
}

// ---------------------------------------------------------------------------
// Fit

export interface FitClaim {
  level: Provenance;
  text: string;
}

export interface FitResidual {
  id: string;
  target: number;
  achieved: number;
  unit: 'L' | 'm';
  /** Set when the parameter hit its range and the target could not be reached. */
  clamped: boolean;
}

export interface FitResult {
  params: FitParams;
  weights: TargetWeights;
  achieved: Measurement;
  residuals: FitResidual[];
  claims: FitClaim[];
  /** Regions whose volume was fitted to data. */
  fitted: RegionId[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One-dimensional solve of f(k) = target on [lo, hi] by bracketing + secant; f is monotone-ish. */
function solve1(f: (k: number) => number, target: number, lo: number, hi: number, start: number, iters = 8): { k: number; clamped: boolean } {
  let k0 = clamp(start, lo, hi), f0 = f(k0) - target;
  if (Math.abs(f0) < 1e-9) return { k: k0, clamped: false };
  // Step in the direction that reduces the error, then secant.
  const step = (hi - lo) * 0.15;
  let k1 = clamp(k0 + (f0 < 0 ? step : -step), lo, hi);
  if (k1 === k0) k1 = clamp(k0 + (f0 < 0 ? -step : step), lo, hi);
  let f1 = f(k1) - target;
  for (let i = 0; i < iters; i++) {
    if (Math.abs(f1) < 2e-3 * Math.max(1e-6, Math.abs(target))) break;
    if (f1 === f0) break;
    const kn = clamp(k1 - (f1 * (k1 - k0)) / (f1 - f0), lo, hi);
    if (kn === k1) break;
    k0 = k1; f0 = f1; k1 = kn; f1 = f(k1) - target;
  }
  const atBound = k1 <= lo + 1e-9 || k1 >= hi - 1e-9;
  return { k: k1, clamped: atBound && Math.abs(f1) > 2e-3 * Math.max(1e-6, Math.abs(target)) };
}

export function fitBody(mesh: HumanMesh, input: FitInput): FitResult {
  const params: FitParams = {
    gender: input.gender,
    age: ageParam(input.age),
    size: 0.5,
    muscle: 0.5,
    detail: emptyDetail(),
  };
  const residuals: FitResidual[] = [];
  const fitted: RegionId[] = [];
  const H = input.heightM;

  // Muscle axis from the skeletal-muscle fraction when known: centred on the template's own.
  if (input.muscleFraction != null) {
    params.muscle = clamp(0.5 + (input.muscleFraction - TEMPLATE_MUSCLE_FRACTION) * 2.5, 0.1, 0.95);
  }

  const volumes = () => mesh.measure(allWeights(params), H, { slices: [] }).volumesL;
  const slice = (id: SliceId) => mesh.measure(allWeights(params), H, { volumes: false, slices: [id] }).circumferencesM[id];

  // Whole-body size: the weight axis, solved on the true blended volume.
  const solveSize = () => {
    if (input.totalVolumeL == null) return;
    const r = solve1((k) => { params.size = k; return volumes().total; }, input.totalVolumeL, 0, 1, params.size);
    params.size = r.k;
    if (r.clamped) residuals.push({ id: 'total', target: input.totalVolumeL, achieved: volumes().total, unit: 'L', clamped: true });
  };

  // When the size axis runs out (a body heavier than MakeHuman's max-weight target at this
  // height, or lighter than its minimum), the remaining volume goes into every parameter
  // no measurement or tape value owns, all by the same amount. Ownership is per
  // parameter: a hip measurement owns hip and buttocks, a waist owns the belly, a
  // measured region owns all of its own.
  const tape = input.circumferencesM;
  const limbTape: Record<Exclude<MeasuredRegion, 'trunk'>, SliceId> = {
    left_arm: 'left_upper_arm', right_arm: 'right_upper_arm', left_leg: 'left_thigh', right_leg: 'right_thigh',
  };
  const freeLimbs = (['left_arm', 'right_arm', 'left_leg', 'right_leg'] as const).filter((r) => !input.regions[r] && tape[limbTape[r]] == null);
  const freeBelly = !input.regions.trunk && tape.waist == null;
  const freeButtocks = !input.regions.trunk && tape.hip == null;
  const solveBulk = () => {
    if (input.totalVolumeL == null) return;
    if (params.size > 0.001 && params.size < 0.999) return;
    if (!freeLimbs.length && !freeBelly && !freeButtocks) return;
    const fatDir = input.fatVolumeFraction ?? 0.3;
    const apply = (k: number) => {
      if (freeBelly) {
        params.detail.trunk.horiz = k;
        params.detail.trunk.depth = 0.7 * k;
        params.detail.trunk.tone = -k * fatDir;
      }
      if (freeButtocks) params.detail.trunk.buttocks = 0.5 * k;
      for (const r of freeLimbs) params.detail.limbs[r] = { fat: k * fatDir, muscle: k * (1 - fatDir) };
    };
    const start = freeBelly ? params.detail.trunk.horiz : freeLimbs.length ? params.detail.limbs[freeLimbs[0]].fat + params.detail.limbs[freeLimbs[0]].muscle : params.detail.trunk.buttocks * 2;
    const r = solve1((k) => { apply(k); return volumes().total; }, input.totalVolumeL, -1, 1, start, 6);
    apply(r.k);
    residuals.splice(0, residuals.length, ...residuals.filter((x) => x.id !== 'total'));
    const achieved = volumes().total;
    if (r.clamped || Math.abs(achieved - input.totalVolumeL) / input.totalVolumeL > 0.02) {
      residuals.push({ id: 'total', target: input.totalVolumeL, achieved, unit: 'L', clamped: r.clamped });
    }
  };

  // A measured region: one scalar along the direction its fat/muscle split gives.
  const solveRegion = (id: MeasuredRegion) => {
    const want = input.regions[id];
    if (!want) return;
    const apply = (k: number) => {
      if (id === 'trunk') {
        params.detail.trunk.horiz = k;
        params.detail.trunk.depth = 0.7 * k;
        params.detail.trunk.tone = -k * want.fatShare;
        params.detail.trunk.buttocks = 0.5 * k;
      } else {
        params.detail.limbs[id] = { fat: k * want.fatShare, muscle: k * (1 - want.fatShare) };
      }
    };
    const current = id === 'trunk' ? params.detail.trunk.horiz : params.detail.limbs[id].fat + params.detail.limbs[id].muscle;
    const r = solve1((k) => { apply(k); return volumes()[id]; }, want.volumeL, -1, 1, current, 5);
    apply(r.k);
    if (!fitted.includes(id)) fitted.push(id);
    const achieved = volumes()[id];
    if (r.clamped || Math.abs(achieved - want.volumeL) / want.volumeL > 0.02) {
      residuals.push({ id, target: want.volumeL, achieved, unit: 'L', clamped: r.clamped });
    }
  };

  // Tape measurements, each on the parameter(s) that mostly move that slice.
  const solveTape = () => {
    const c = input.circumferencesM;
    const fatDir = input.fatVolumeFraction ?? 0.3;
    const one = (id: SliceId, apply: (k: number) => void, start: number) => {
      const want = c[id];
      if (want == null) return;
      const r = solve1((k) => { apply(k); return slice(id); }, want, -1, 1, start, 5);
      apply(r.k);
      const achieved = slice(id);
      if (r.clamped || Math.abs(achieved - want) > 0.01) residuals.push({ id, target: want, achieved, unit: 'm', clamped: r.clamped });
    };
    one('waist', (k) => { params.detail.trunk.tone = -k; params.detail.trunk.horiz = 0.6 * k; params.detail.trunk.depth = 0.5 * k; }, params.detail.trunk.horiz);
    one('hip', (k) => { params.detail.trunk.hip = k; params.detail.trunk.buttocks = k; }, params.detail.trunk.hip);
    one('chest', (k) => { params.detail.trunk.pectoral = 0.5 * k; params.detail.trunk.vshape = 0.5 * k; }, params.detail.trunk.vshape);
    for (const [slice, limb] of [['left_upper_arm', 'left_arm'], ['right_upper_arm', 'right_arm'], ['left_thigh', 'left_leg'], ['right_thigh', 'right_leg']] as const) {
      one(slice, (k) => { params.detail.limbs[limb] = { fat: k * fatDir, muscle: k * (1 - fatDir) }; }, params.detail.limbs[limb].fat + params.detail.limbs[limb].muscle);
    }
  };

  const regionIds = Object.keys(input.regions) as MeasuredRegion[];
  const hasTape = Object.keys(input.circumferencesM).length > 0;

  // Size first, then the parts, then size again to absorb what the parts changed, and
  // the parts last so every measured region lands on its own number. The residual list
  // is only kept from the final round.
  const rounds = regionIds.length || hasTape ? 3 : 2;
  for (let round = 0; round < rounds; round++) {
    residuals.length = 0;
    solveSize();
    solveBulk();
    for (const id of regionIds) solveRegion(id);
    if (hasTape) solveTape();
  }

  const weights = allWeights(params);
  const achieved = mesh.measure(weights, H);
  return { params, weights, achieved, residuals, claims: buildClaims(input, fitted, residuals, achieved), fitted };
}

function buildClaims(input: FitInput, fitted: RegionId[], residuals: FitResidual[], achieved: Measurement): FitClaim[] {
  const claims: FitClaim[] = [];
  const pct = (a: number, b: number) => `${(Math.abs(a - b) / b * 100).toFixed(1)} %`;
  if (input.totalVolumeL != null) {
    claims.push({
      level: input.source === 'report' ? 'derived' : 'estimated',
      text:
        input.source === 'report'
          ? `The whole body is drawn at ${achieved.volumesL.total.toFixed(1)} L, the volume your weight and body fat imply (off by ${pct(achieved.volumesL.total, input.totalVolumeL)}).`
          : `The whole body is drawn at ${achieved.volumesL.total.toFixed(1)} L, the volume your entered weight and the body-fat figure imply.`,
    });
  }
  if (fitted.length) {
    const worst = residuals.filter((r) => r.unit === 'L' && r.id !== 'total');
    claims.push({
      level: 'derived',
      text: `${fitted.length === 5 ? 'Trunk, arms and legs' : fitted.length + ' regions'} are drawn so each region's volume matches the volume its measured fat and muscle imply${
        worst.length ? `, except ${worst.map((r) => `${r.id.replace('_', ' ')} (drawn at ${r.achieved.toFixed(1)} L; mass implies ${r.target.toFixed(1)} L)`).join(', ')}` : ''
      }.`,
    });
    claims.push({
      level: 'illustrative',
      text: 'Whether a region fills out in a fat-looking or a muscle-looking way follows its measured ratio, but how that looks is a template choice.',
    });
  }
  // Each tape value, as drawn. When the shape could not reach a value, say so with
  // both numbers rather than pretend.
  const cm = (m: number) => `${(m * 100).toFixed(1)} cm`;
  for (const [id, want] of Object.entries(input.circumferencesM)) {
    if (want == null) continue;
    const got = achieved.circumferencesM[id];
    const label = id.replace(/_/g, ' ');
    const close = Math.abs(got - want) <= 0.01;
    claims.push({
      level: 'self_reported',
      text: close
        ? `${label[0].toUpperCase()}${label.slice(1)} drawn at ${cm(got)}, as you entered.`
        : `${label[0].toUpperCase()}${label.slice(1)}: you entered ${cm(want)}; this body shape reaches ${cm(got)} at the given weight, so that is what is drawn.`,
    });
  }
  claims.push({
    level: 'illustrative',
    text: `Face, hands, feet, limb lengths and proportions are a template body${
      input.gender === 0.5 ? ' shown as a neutral blend' : ''
    }, scaled to ${(input.heightM * 100).toFixed(0)} cm. Nothing here is a scan of you.`,
  });
  return claims;
}
