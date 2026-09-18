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

## Known risks

- **Extraction is the schedule risk.** If the PDFs turn out to be image-only with no text
  layer, Stage 1 changes shape and costs more. Stage 1 is instructed to stop and report
  this rather than silently building an OCR pipeline.
- **The generated metric copy needs a human read.** The lint catches forbidden phrasing,
  not subtle inaccuracy. Read `metric-knowledge.json` before showing the product to anyone.
- **Two reports from two people cannot demonstrate longitudinal change.** Profiles keep the
  record honest, but a genuine over-time demo needs a second scan of the same person.
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
