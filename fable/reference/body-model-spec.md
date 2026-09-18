# Parametric Body Model — Technical Specification

This is the crux of the product. Read it fully before writing any 3D code.

## The core idea

The body is **generated in code from the report's mass measurements**, not loaded as an
art asset and posed. There is no external mesh file, no rigging, no blend shapes.

Every segment's **volume comes from real measured mass**. Only segment *lengths* use
standard body proportions, and those are tagged `illustrative` in the provenance model
and disclosed in the UI.

This is what makes the claim "data-derived" literally true rather than decorative.

## Segment map

| Segment | Fat metric | Muscle metric | Notes |
|---|---|---|---|
| `trunk` | `trunk_fat_mass` | `trunk_muscle_mass` | profiled chest→waist→hip |
| `left_arm` | `left_arm_fat_mass` | `left_arm_muscle_mass` | split upper arm / forearm |
| `right_arm` | `right_arm_fat_mass` | `right_arm_muscle_mass` | split upper arm / forearm |
| `left_leg` | `left_leg_fat_mass` | `left_leg_muscle_mass` | split thigh / calf |
| `right_leg` | `right_leg_fat_mass` | `right_leg_muscle_mass` | split thigh / calf |
| `head`, `neck`, `hands`, `feet` | — | — | **not measured** — see rendering rule below |

Arms and legs each receive one fat mass and one muscle mass from the report. Split the
mass between their two sub-segments by their length share, and say so in the UI copy
(`illustrative` distribution within the limb; the measurement is for the whole limb).

## Geometry derivation

### 1. Scale

```
h = height in metres (from report if present, else entered at verification)
```

If height is missing, the body must not render until the user supplies it. Do not
default silently — height drives every length.

### 2. Segment lengths (ILLUSTRATIVE — tag as such)

Standard proportions as fractions of `h`:

```
torso        0.300 * h
upper_arm    0.186 * h
forearm      0.146 * h
thigh        0.245 * h
calf         0.246 * h
neck         0.052 * h
head         0.130 * h
```

These are generic human proportions, not measurements of this person. Every surface that
exposes them must carry the `illustrative` marker.

### 3. Muscle core radius (MEASURED → derived)

Treat a limb segment's muscle as a cylinder of tissue around the bone axis:

```
V_muscle = M_muscle / 1.06        # muscle density ≈ 1.06 g/cm³ → litres from kg
r_muscle = sqrt( V_muscle / (π * L) )
```

### 4. Fat shell (MEASURED → derived)

Fat forms an annulus outside the muscle core:

```
V_fat   = M_fat / 0.90            # adipose density ≈ 0.90 g/cm³
r_outer = sqrt( r_muscle² + V_fat / (π * L) )
```

`r_outer` is the visible silhouette. `r_muscle` is the inner surface revealed in muscle
layer mode. Both fall directly out of measured mass — no population reference values are
involved anywhere in this pipeline. That is deliberate: PRD §36 forbids inventing
reference ranges, and this formulation never needs one.

### 5. Trunk

Same volume logic, but distribute the total trunk volume along a chest→waist→hip radius
profile rather than a constant radius. Add a fixed incompressible core representing
skeleton and organs (use `bone_mass` when present, otherwise a constant, tagged
`illustrative`) so the trunk never collapses to zero at low fat/muscle values.

Normalise the profile so the **integrated volume equals** `V_muscle + V_fat + V_core`.
The shape is illustrative; the volume is measured.

### 6. Asymmetry

Left and right segments are computed independently from their own masses. Asymmetry
therefore appears in the geometry automatically — it is never applied as an effect.
Display `body_symmetry` alongside, and flag when the measured left/right difference
disagrees with the symmetry score (see conflict rules).

## Rendering rules

### Unmeasured anatomy

Head, neck, hands and feet have no measurements. Render them **visually distinct** —
desaturated, semi-transparent, or wireframe — never as solid as measured segments. On
hover: *"Not measured in this report."*

This is a hard requirement (PRD §5.4, §17). A viewer must be able to tell at a glance
which parts of the body the data actually speaks to.

### Persistent disclosure

A permanent, unobtrusive label on the body view:

> Generated from your measurements. Not a scan of your anatomy.

### Layer modes

| Mode | Rendering |
|---|---|
| `normal` | Neutral material, outer silhouette |
| `fat` | Colour intensity per segment by fat share of segment volume |
| `muscle` | Inner muscle core exposed; colour by muscle share of segment volume |
| `balance` | Diverging colour on `(L − R) / mean(L, R)` per limb pair |

Colour intensity is **relative to this person's own segments**, not to a population
norm. The report's own classification labels carry any high/low judgement.

## Silhouette neutrality

One androgynous base. No sex-differentiated proportions. Every visible difference between
two people's bodies must trace to their measurements. This keeps the model defensible and
means one mesh generator instead of two.

## Interaction

- Orbit (rotate), zoom, pan
- Preset camera buttons: front, back, left, right
- Click a segment → raycast → select region → information panel updates
- Selected segment highlights; others dim

## Snapshot transitions (Stage 4)

Because the mesh is generated from numbers, morphing between two snapshots is just
interpolating the input masses and regenerating. Lerp the metric values over ~600ms and
rebuild each frame, or precompute both and lerp vertex positions if performance requires.

Only interpolate **for the visual transition**. Never present an interpolated value as a
measurement, and never plot interpolated points on a chart (PRD §27).

## Provenance tagging

Every parameter fed into the mesh carries one of:

- `measured` — mass values straight from the report
- `derived` — radii computed from measured mass via the formulas above
- `illustrative` — segment lengths, trunk profile shape, intra-limb mass split, core size

The UI must let a user discover which is which.
