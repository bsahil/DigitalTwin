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

Height is **not printed in the report**. Derive it:

```
h = sqrt(weight_kg / bmi)
```

Verified against both reference files: 165.2 cm and 178.2 cm. Tag it `derived`, pre-fill
it at verification for the user to confirm or correct, and never present it as measured.

### 1a. Which muscle figure to use — important

Use the **segmental** values (`trunk_muscle_mass`, `left_leg_muscle_mass`, …), never
`skeletal_muscle_mass`. They are different quantities:

| | Report A | Report B |
|---|---|---|
| sum of 5 segmental muscle values | 29.5 kg | 51.3 kg |
| `skeletal_muscle_mass` | 18.2 kg | 33.5 kg |
| `lean_mass` | 34.9 kg | 59.4 kg |

The segmental figures are lean soft tissue per segment and reconcile with `lean_mass`
(the difference — 5.4 kg and 8.1 kg — is head, neck, hands and feet, the segments the
scan does not report). `skeletal_muscle_mass` is a narrower quantity and will produce
limbs roughly 40% too thin if used here.

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

**Volume distribution within a limb is not uniform.** A limb's measured mass covers the
whole limb; distributing it evenly over the full length produces a visibly wrong,
tubular result. Weight it toward the proximal segment and taper along each segment:

```
thigh 65% / calf 35%  of leg volume
upper arm 60% / forearm 40%  of arm volume
```

Validation against the reference data: treating each leg as one uniform cylinder gives a
35 cm circumference for Report A, which is far too thin. With the taper applied the thigh
lands in a plausible range. The trunk needs no such correction — as a single compact
segment it computes to 84.4 cm (A) and 89.6 cm (B), both realistic.

The split is `illustrative`; the total limb volume it distributes is `measured`.

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

Same volume logic, distributed along a chest→waist→hip radius profile rather than a
constant radius. Normalise the profile so the **integrated volume equals** the computed
total. The shape is illustrative; the volume is measured.

Trunk fat is **`trunk_fat_mass` + `visceral_fat_mass`**. Verified in both files:

```
subcutaneous_fat_mass + visceral_fat_mass = fat_mass     (exact, 0.0% error, both reports)
sum of the 5 regional fat values          = subcutaneous_fat_mass
```

So the regional figures are subcutaneous only, and visceral fat must be added to the
trunk separately or it vanishes from the model.

This gives the trunk a genuinely data-driven two-compartment structure: render
**visceral fat as an inner core and subcutaneous as the outer shell**. Both are measured,
and it makes the visceral/subcutaneous distinction visible rather than merely stated.

### 5a. Coverage check

The five measured segments account for **93% (A) and 92% (B)** of total body volume
(total from `weight / density`, density via Siri from `fat_percentage`). The 7–8%
remainder is head, neck, hands and feet — exactly the segments rendered as unmeasured.

Use this as a unit test: if measured segments come to less than ~85% or more than ~97%
of total body volume, the mesh inputs are wrong.

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
