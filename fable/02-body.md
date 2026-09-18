# Stage 2 — The Body

**Goal:** the verified metrics become a body on screen that can be rotated, explored and
clicked. This is the product's signature moment.

Read `reference/body-model-spec.md` in full before writing any 3D code. It contains the
exact geometry derivation. Follow it — do not improvise an alternative approach, and do
not load an external humanoid mesh.

---

## Build

### 1. Mesh generator

A pure function: verified metrics + height → geometry parameters → Three.js meshes.

Segment volumes come from measured mass via the density formulas in the spec. Segment
lengths use standard proportions and are tagged `illustrative`. No population reference
values enter this pipeline at any point.

Keep the generator free of React and free of rendering concerns so it can be unit tested
on numbers alone.

### 2. Body view

The body dominates the screen. Dark, calm environment. Restrained lighting — legibility
over spectacle.

Controls: orbit, zoom, pan, and preset camera buttons for front, back, left, right.

Persistent label: *"Generated from your measurements. Not a scan of your anatomy."*

Head, neck, hands and feet render visibly unmeasured — desaturated or semi-transparent,
never as solid as measured segments. Hovering them says *"Not measured in this report."*

### 3. Region interaction

Click a segment → it highlights, the others dim, and the information panel opens with
that region's real values:

```
LEFT LEG
Muscle               5.5 kg    — <classification from the report>
Fat                  2.5 kg    — <classification from the report>
Muscle-to-fat ratio  2.2       — <classification from the report>
```

Show the provider's own classification words verbatim, attributed: *"according to your
report"*. Do not restate them as the app's own judgement.

A **Explain these numbers** button is present but inert until Stage 3. Wire the slot, not
the content.

### 4. Layer modes

Four modes, switchable: `normal`, `fat`, `muscle`, `balance`. Behaviour per the spec.
Colour intensity is relative to this person's own segments — never to an invented norm.

The `balance` mode should make real left/right asymmetry visible, since it emerges from
the independent per-side geometry rather than being applied as an effect.

### 5. Dashboard frame

Around the body: the profile name and measurement date, and a restrained strip of four
headline values — weight, body fat, muscle, water — with their source classifications.

Nothing else. The remaining metrics are progressively disclosed through region clicks and
Stage 3. Do not put forty numbers on this screen.

### 6. Provenance affordance

A small, discoverable control that reveals which parts of what is on screen are
`measured`, `derived` or `illustrative`. A toggle, an info panel, or annotation on hover —
your choice, but it must be genuinely usable, not buried.

## Acceptance checks

1. Two different sets of input metrics produce two visibly different bodies, and the
   difference traces to the measurements.
2. Left/right mass differences in the data are visible in the geometry.
3. Unmeasured segments are distinguishable from measured ones at a glance.
4. Every one of the five measured regions is clickable and shows its real values with the
   report's own classifications.
5. Unit tests on the generator: given known masses and height, radii match the spec
   formulas; zero or missing mass for a segment degrades gracefully rather than producing
   NaN geometry or a collapsed limb.
6. Missing height blocks body generation with a clear prompt rather than defaulting silently.
7. Rotate, zoom and all four camera presets work. Frame rate stays smooth on a laptop.

## Do not build in this stage

Metric explanations. Relationship graph. Conflict flags. Timeline. Comparison. Morphing
between snapshots. Elaborate intro animations, particle effects or cinematic camera moves.

Stop when the body is correct, honest and pleasant to explore.
