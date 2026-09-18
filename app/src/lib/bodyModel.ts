/**
 * Generates the body from measured mass.
 *
 * Segment volume comes from the report's mass values via tissue density, so the mesh
 * cannot exist without the measurements. Only the *shape* along each segment and the
 * segment lengths are generic human proportions — those are tagged `illustrative` and
 * disclosed in the UI.
 *
 * No population reference values enter this pipeline at any point, which is what lets
 * the product honour its own rule against inventing reference ranges.
 */

export type RegionId =
  | 'trunk'
  | 'left_arm'
  | 'right_arm'
  | 'left_leg'
  | 'right_leg'
  | 'head'
  | 'neck'
  | 'hands'
  | 'feet';

const MUSCLE_DENSITY = 1.06; // kg/L
const FAT_DENSITY = 0.9; // kg/L

/** Segment lengths as fractions of height. Generic proportions — ILLUSTRATIVE. */
export const LENGTH_FRACTIONS = {
  trunk: 0.3,
  upper_arm: 0.186,
  forearm: 0.146,
  thigh: 0.245,
  calf: 0.246,
  neck: 0.052,
  head: 0.13,
  ankle: 0.04,
} as const;

/**
 * Depth ÷ width for each segment's cross-section. A torso is far wider than it is
 * deep; limbs are nearly round. ILLUSTRATIVE.
 */
const DEPTH_RATIO = { trunk: 0.72, arm: 0.9, leg: 0.88 } as const;

/** Ellipse axes that preserve the circle's area: a = r/√k, b = r√k, so a·b = r². */
const ellipse = (k: number) => ({ scaleX: 1 / Math.sqrt(k), scaleZ: Math.sqrt(k) });

/** Arms hang slightly clear of the torso so the silhouette separates. ILLUSTRATIVE. */
const ARM_ABDUCTION = 0.17;

/**
 * Shape along each segment, sampled top to bottom. Normalised, so only the *relative*
 * form is fixed here — absolute thickness is set entirely by measured volume.
 * ILLUSTRATIVE.
 */
const SHAPE: Record<'trunk' | 'arm' | 'leg', number[]> = {
  // shoulders -> chest -> waist -> hip
  trunk: [0.86, 1.02, 1.0, 0.9, 0.85, 0.88, 0.97, 1.0, 0.93],
  // shoulder -> upper arm -> elbow -> forearm -> wrist
  arm: [1.05, 1.02, 0.93, 0.8, 0.78, 0.9, 0.82, 0.64, 0.5],
  // hip -> thigh -> knee -> calf -> ankle
  leg: [1.04, 1.1, 0.98, 0.84, 0.78, 0.95, 0.84, 0.56, 0.45],
};

export interface Segment {
  id: RegionId;
  label: string;
  measured: boolean;
  /** Top of the segment in world space; the segment extends downward. */
  origin: [number, number, number];
  /**
   * Cross-section shaping. A solid of revolution is circular; real segments are
   * ellipses. For measured segments scaleX * scaleZ === 1, so the ellipse holds
   * exactly the volume the circle did — only the shape changes. ILLUSTRATIVE.
   */
  scaleX?: number;
  scaleZ?: number;
  /** Rotation about z, in radians, applied at the segment's origin. ILLUSTRATIVE. */
  rotationZ?: number;
  length: number;
  /**
   * Radii sampled top to bottom, in metres — the array that is actually drawn, so a
   * volume integrated over it is the volume on screen.
   */
  outer: number[];
  muscle: number[];
  /** Trunk only: visceral fat as an inner core. */
  visceral?: number[];
  mass: { lean: number; fat: number; visceral?: number };
  volumeL: number;
  /** Fat as a share of this segment's volume, for the fat layer. */
  fatShare: number;
  muscleShare: number;
}

export interface BodyModel {
  heightM: number;
  segments: Segment[];
  /** Measured segment volume as a share of whole-body volume. Expect ~0.85–0.97. */
  coverage: number;
  totalBodyVolumeL: number;
  measuredVolumeL: number;
  /** Signed left/right difference per pair, for the balance layer. */
  asymmetry: { arms: number; legs: number };
}

export type MetricValues = Record<string, number>;

/** ∫₀¹ p(t)² dt by trapezoid, for volume normalisation. */
function shapeIntegral(profile: number[]): number {
  const n = profile.length - 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (profile[i] ** 2 + profile[i + 1] ** 2) / 2;
  }
  return sum / n;
}

/**
 * Scales a normalised shape so the solid of revolution holds exactly `volumeL` litres.
 * V = π k² L ∫p² dt  ⟹  k = √(V / (π L ∫p² dt))
 */
function radiiForVolume(profile: number[], length: number, volumeL: number): number[] {
  if (volumeL <= 0 || length <= 0) return profile.map(() => 0);
  const k = Math.sqrt(volumeL / 1000 / (Math.PI * length * shapeIntegral(profile)));
  return profile.map((p) => k * p);
}

/** Samples along every drawn profile. */
export const DRAWN = 48;

/**
 * Monotone cubic interpolation (Fritsch–Carlson). Unlike Catmull-Rom it never
 * overshoots the control points, so scaling one resampled shape by three different
 * factors keeps visceral < muscle < outer at every sample, and no clamp is needed.
 */
export function pchip(values: number[], count = DRAWN): number[] {
  const n = values.length;
  if (n === 0) return Array.from({ length: count }, () => 0);
  if (n === 1) return Array.from({ length: count }, () => values[0]);

  const delta = values.slice(0, -1).map((v, i) => values[i + 1] - v);
  const d = new Array<number>(n).fill(0);

  const endpoint = (a: number, b: number) => {
    let e = (3 * a - b) / 2;
    if (Math.sign(e) !== Math.sign(a)) e = 0;
    else if (Math.sign(a) !== Math.sign(b) && Math.abs(e) > 3 * Math.abs(a)) e = 3 * a;
    return e;
  };
  d[0] = endpoint(delta[0], delta[1] ?? delta[0]);
  d[n - 1] = endpoint(delta[n - 2], delta[n - 3] ?? delta[n - 2]);

  for (let i = 1; i < n - 1; i++) {
    const a = delta[i - 1];
    const b = delta[i];
    d[i] = a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  }

  return Array.from({ length: count }, (_, k) => {
    const x = (k / (count - 1)) * (n - 1);
    const i = Math.min(Math.floor(x), n - 2);
    const t = x - i;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * values[i] +
      (t3 - 2 * t2 + t) * d[i] +
      (-2 * t3 + 3 * t2) * values[i + 1] +
      (t3 - t2) * d[i + 1]
    );
  });
}

const val = (m: MetricValues, key: string): number =>
  typeof m[key] === 'number' && Number.isFinite(m[key]) ? m[key] : 0;

export function buildBodyModel(metrics: MetricValues, heightCm: number): BodyModel {
  const h = heightCm / 100;
  const L = LENGTH_FRACTIONS;

  const armLength = (L.upper_arm + L.forearm) * h;
  const legLength = (L.thigh + L.calf) * h;

  const ankleY = L.ankle * h;
  // Limbs sink slightly into the torso so the joins read as a body rather than as
  // stacked parts. Purely presentational — it moves nothing that was measured.
  const jointOverlap = 0.03 * h;
  const legTopY = ankleY + legLength;
  const hipY = legTopY - jointOverlap;
  const shoulderY = hipY + L.trunk * h;
  const neckTopY = shoulderY + L.neck * h;

  const segments: Segment[] = [];

  const push = (
    id: RegionId,
    label: string,
    shape: number[],
    origin: [number, number, number],
    length: number,
    lean: number,
    fat: number,
    visceralMass?: number,
  ) => {
    const vVisceral = (visceralMass ?? 0) / FAT_DENSITY;
    const vLean = lean / MUSCLE_DENSITY;
    const vFat = fat / FAT_DENSITY;
    const total = vVisceral + vLean + vFat;

    // Volume is fitted to the resampled profile, so the drawn array holds it exactly.
    const drawn = pchip(shape);

    segments.push({
      id,
      label,
      // A region with no mass at all was not measured; the questionnaire path has none.
      measured: lean + fat > 0,
      origin,
      length,
      // Nested shells: visceral core, then muscle, then fat to the silhouette.
      visceral: visceralMass ? radiiForVolume(drawn, length, vVisceral) : undefined,
      muscle: radiiForVolume(drawn, length, vVisceral + vLean),
      outer: radiiForVolume(drawn, length, total),
      mass: { lean, fat, visceral: visceralMass },
      volumeL: total,
      fatShare: total > 0 ? (vFat + vVisceral) / total : 0,
      muscleShare: total > 0 ? vLean / total : 0,
    });
  };

  // Trunk carries visceral fat as well: the regional fat values are subcutaneous only,
  // and subcutaneous + visceral reconciles exactly with total fat mass.
  push(
    'trunk',
    'Trunk',
    SHAPE.trunk,
    [0, shoulderY, 0],
    L.trunk * h,
    val(metrics, 'trunk_muscle_mass'),
    val(metrics, 'trunk_fat_mass'),
    val(metrics, 'visceral_fat_mass'),
  );

  for (const side of ['left', 'right'] as const) {
    push(
      `${side}_arm` as RegionId,
      side === 'left' ? 'Left arm' : 'Right arm',
      SHAPE.arm,
      [0, shoulderY - 0.05 * h, 0],
      armLength,
      val(metrics, `${side}_arm_muscle_mass`),
      val(metrics, `${side}_arm_fat_mass`),
    );
    push(
      `${side}_leg` as RegionId,
      side === 'left' ? 'Left leg' : 'Right leg',
      SHAPE.leg,
      [0, legTopY, 0],
      legLength,
      val(metrics, `${side}_leg_muscle_mass`),
      val(metrics, `${side}_leg_fat_mass`),
    );
  }

  // Limbs are placed against the torso they actually computed to, so a wider trunk or a
  // thicker arm moves the join rather than leaving a gap.
  const find = (id: string) => segments.find((s) => s.id === id)!;
  const trunkTopR = find('trunk').outer[0];
  const trunkBottomR = find('trunk').outer.at(-1)!;
  const armTopR = Math.max(find('left_arm').outer[0], find('right_arm').outer[0]);
  const legTopR = Math.max(find('left_leg').outer[0], find('right_leg').outer[0]);

  // Cross-sections are ellipses, so a segment is wider in x than its radius. Joins are
  // placed against that widened silhouette, not the underlying circle.
  const trunkShape = ellipse(DEPTH_RATIO.trunk);
  const armShape = ellipse(DEPTH_RATIO.arm);
  const legShape = ellipse(DEPTH_RATIO.leg);

  find('trunk').scaleX = trunkShape.scaleX;
  find('trunk').scaleZ = trunkShape.scaleZ;

  const trunkTopW = trunkTopR * trunkShape.scaleX;
  const trunkBottomW = trunkBottomR * trunkShape.scaleX;
  const armTopW = armTopR * armShape.scaleX;
  const legTopW = legTopR * legShape.scaleX;

  const armX = Math.max(trunkTopW + armTopW * 0.12, armTopW * 1.15);
  const legX = Math.min(legTopW * 0.94, Math.max(trunkBottomW - legTopW, legTopW * 0.5));

  // Anatomical convention: the figure faces the front camera, so its left side is on
  // the viewer's right. The report distinguishes left from right and the asymmetry
  // layer depends on it, so this cannot be mirrored.
  const sideSign = (side: 'left' | 'right') => (side === 'left' ? 1 : -1);

  for (const side of ['left', 'right'] as const) {
    const sign = sideSign(side);
    const arm = find(`${side}_arm`);
    arm.origin[0] = sign * armX;
    arm.rotationZ = sign * ARM_ABDUCTION;
    arm.scaleX = armShape.scaleX;
    arm.scaleZ = armShape.scaleZ;

    const leg = find(`${side}_leg`);
    leg.origin[0] = sign * legX;
    leg.scaleX = legShape.scaleX;
    leg.scaleZ = legShape.scaleZ;
  }

  const wristR = find('left_arm').outer.at(-1)!;
  const ankleR = find('left_leg').outer.at(-1)!;

  // The wrist has moved with the abducted arm, so hands follow the rotated end
  // rather than hanging where an unrotated arm would have finished.
  const reach = armLength - wristR;
  const wristDrop = reach * Math.cos(ARM_ABDUCTION);
  const wristOut = reach * Math.sin(ARM_ABDUCTION);

  // Unmeasured segments. Sized from height alone and rendered as such — the scan
  // reports nothing about them, so the model must not imply otherwise.
  const headR = 0.052 * h;
  const neckR = 0.028 * h;
  segments.push(
    {
      id: 'neck',
      label: 'Neck',
      measured: false,
      origin: [0, neckTopY, 0],
      length: L.neck * h,
      outer: pchip([neckR, neckR, neckR]),
      muscle: pchip([neckR, neckR, neckR]),
      mass: { lean: 0, fat: 0 },
      volumeL: 0,
      fatShare: 0,
      muscleShare: 0,
    },
    {
      id: 'head',
      label: 'Head',
      measured: false,
      origin: [0, neckTopY + L.head * h, 0],
      length: L.head * h,
      scaleX: 0.9,
      scaleZ: 1.12,
      outer: pchip([headR * 0.55, headR, headR * 1.02, headR * 0.92, headR * 0.6]),
      muscle: pchip([headR * 0.55, headR, headR * 1.02, headR * 0.92, headR * 0.6]),
      mass: { lean: 0, fat: 0 },
      volumeL: 0,
      fatShare: 0,
      muscleShare: 0,
    },
  );

  for (const side of ['left', 'right'] as const) {
    const sign = sideSign(side);
    // Sized from the limb they join, so they never read as blocks bolted on the end.
    const handR = wristR * 1.15;
    const footR = ankleR * 1.05;
    segments.push(
      {
        id: 'hands',
        label: 'Hands',
        measured: false,
        origin: [sign * (armX + wristOut), shoulderY - 0.05 * h - wristDrop, 0],
        rotationZ: sign * ARM_ABDUCTION,
        scaleX: 1.25,
        scaleZ: 0.55,
        length: 0.085 * h,
        outer: pchip([handR * 0.8, handR, handR * 0.95, handR * 0.6]),
        muscle: pchip([handR * 0.8, handR, handR * 0.95, handR * 0.6]),
        mass: { lean: 0, fat: 0 },
        volumeL: 0,
        fatShare: 0,
        muscleShare: 0,
      },
      {
        id: 'feet',
        label: 'Feet',
        measured: false,
        // Offset forward so the figure has a discernible front — a body of revolution
        // otherwise looks identical from every angle.
        origin: [sign * legX, ankleY + ankleR, footR * 0.7],
        length: ankleY + ankleR,
        scaleX: 0.86,
        scaleZ: 2.2,
        outer: pchip([footR * 0.85, footR, footR * 0.95, footR * 0.7]),
        muscle: pchip([footR * 0.85, footR, footR * 0.95, footR * 0.7]),
        mass: { lean: 0, fat: 0 },
        volumeL: 0,
        fatShare: 0,
        muscleShare: 0,
      },
    );
  }

  // Whole-body volume from weight and body density (Siri), to sanity-check coverage.
  const weight = val(metrics, 'weight');
  const fatPct = val(metrics, 'fat_percentage');
  const density = fatPct > 0 ? 495 / (fatPct + 450) : 1.02;
  const totalBodyVolumeL = weight > 0 ? weight / density : 0;
  const measuredVolumeL = segments
    .filter((s) => s.measured)
    .reduce((sum, s) => sum + s.volumeL, 0);

  const diff = (a: number, b: number) => {
    const mean = (a + b) / 2;
    return mean > 0 ? (a - b) / mean : 0;
  };

  return {
    heightM: h,
    segments,
    coverage: totalBodyVolumeL > 0 ? measuredVolumeL / totalBodyVolumeL : 0,
    totalBodyVolumeL,
    measuredVolumeL,
    asymmetry: {
      arms: diff(val(metrics, 'left_arm_muscle_mass'), val(metrics, 'right_arm_muscle_mass')),
      legs: diff(val(metrics, 'left_leg_muscle_mass'), val(metrics, 'right_leg_muscle_mass')),
    },
  };
}

