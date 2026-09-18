# Body Atlas — Fable Prompt Pack

Staged build instructions derived from the Body Atlas PRD v1.0, scoped to a **$60 credit
ceiling** with a stopping point after every stage.

## How to run it

1. Start a Fable session. **Attach both FITTR PDFs.**
2. Paste `00-project-brief.md`, plus the three files in `reference/`. Wait for
   acknowledgement.
3. Paste `01-data-spine.md`. Let it finish. **Check your credit balance.**
4. Repeat for `02-body.md`, `03-understanding.md`, `04-time.md`, checking spend each time.

The gates are the point. Each stage ends with a working product, so if credits run short
you stop with something real rather than a half-built everything.

| After | You have |
|---|---|
| Stage 1 | Real PDFs parsed, verified, stored, profiles separated |
| Stage 2 | A data-derived 3D body you can rotate and click |
| Stage 3 | Every number explained, connected, and conflict-flagged |
| Stage 4 | Two reports, comparison, and the body changing over time |

Stage 2 is the point of no return for the product's identity — if the budget is going to
run out, it is better to arrive there with Stages 1–2 solid than to have all four stages
half-done.

## Decisions locked in

Resolved before writing these prompts, because leaving any of them to Fable's discretion
would have cost a paid iteration to undo:

| Question | Decision |
|---|---|
| Scope | Core loop with 3D. No Ask tab, no separate Insights tab, no health timeline |
| 3D approach | Parametric mesh generated in code from mass measurements. No external asset |
| Body form | One neutral silhouette; all difference comes from data |
| Metric copy | Generated once into a reviewable static JSON, not at runtime |
| Runtime AI | None. Deterministic parser, no API key, no network calls |
| Storage | Browser-local IndexedDB, no accounts, data never leaves the device |
| Two subjects | Subject detection at verification; separate profiles, separate timelines |
| Packaging | Four staged prompts with budget gates |

## Why the body is parametric

The PRD's hardest requirement is that the body be genuinely data-derived rather than a
generic model with hotspots. Loading a rigged humanoid and scaling it would have been
decorative — the mesh would exist first and the data would nudge it.

Generating it instead means **segment volume is computed from measured mass** via tissue
density. The body cannot exist without the measurements. As a side effect it needs no
population reference values anywhere, which satisfies the PRD's prohibition on inventing
reference ranges by construction rather than by discipline, and it makes snapshot morphing
nearly free — interpolating the body is interpolating the numbers.

See `reference/body-model-spec.md` for the derivation.

## Validated against the real files

Both PDFs were parsed before these prompts were finalised. Findings are folded into the
specs:

- **Text layer confirmed.** A prototype parser extracted **55/55** metrics from Report A
  and **54/55** from Report B. No OCR needed — the largest schedule risk is retired.
- **Height is derivable** as `sqrt(weight/bmi)` → 165.2 cm and 178.2 cm. The report never
  prints it, so it is pre-filled as `derived` rather than blocking the build.
- **Report B is missing `muscle_control` entirely.** Dynamic counts are mandatory.
- **The Data Check fires on real data.** `lean_mass` and `fat_free_mass` are the *same
  number* with contradictory labels in both reports (34.9 Healthy/Low; 59.4 Athletic/Low),
  and `lean_mass_percentage` is arithmetically wrong in both by ~7% while every other
  percentage is exact to 0.2%.
- **The body model reconciles.** Measured segments account for 93% and 92% of total body
  volume; trunk circumference computes to 84.4 cm and 89.6 cm. Both plausible.
- **Segmental muscle ≠ `skeletal_muscle_mass`.** Using the latter makes limbs ~40% too
  thin. The spec now says which to use and why.

## Known risks

- **The generated metric copy needs a human read.** The lint catches forbidden phrasing,
  not subtle inaccuracy. Read `metric-knowledge.json` before showing the product to anyone.
- **There is no longitudinal pair.** Both reports are different people dated the same day.
  Profiles keep the record honest, but demonstrating change over time needs a second scan
  of the same person.
- **Limb geometry needs tuning.** Volumes are right; distribution along the limb is the
  part that needs the taper profile and a look at the rendered result.
- **$60 is tight.** Treat it as funding Stages 1–2 with confidence and 3–4 as conditional.

## Files

```
00-project-brief.md              paste first — principles, stack, data model
01-data-spine.md                 parser, verification, storage, profiles
02-body.md                       parametric 3D body, regions, layers
03-understanding.md              explanations, relationships, Data Check
04-time.md                       second report, timeline, comparison
reference/metric-catalog.md      ~55 canonical metrics
reference/body-model-spec.md     geometry derivation from mass
reference/relationships-and-conflicts.md   relationship graph, conflict rules
```
