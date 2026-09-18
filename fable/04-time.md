# Stage 4 — Time

**Goal:** a second report closes the loop — the body changes, and the change is explained
without overclaiming.

This stage only runs within a single profile. Two reports from two different people never
share a timeline.

---

## Build

### 1. Second upload

The Stage 1 pipeline, unchanged, for report two. Subject detection decides which profile it
joins. A report that fails subject matching creates its own profile and does not enter the
existing timeline.

### 2. Timeline

Reports as discrete points on a real date axis. Sparse is correct: two reports six months
apart render as two points with **"6 months between measurements"** between them.

Never draw a connecting trend line that implies measurements in between. Never interpolate
a value and present it as data. Charts plot measured points only.

### 3. Snapshot switching

Select any report to see the body as of that date. Because the mesh is generated from
numbers, transitioning between snapshots is interpolating the input masses and
regenerating — keep it short and purposeful, around 600ms.

The interpolation is a **visual transition only**. Intermediate frames are never labelled,
never readable as values, and never recorded. If this proves fiddly, a clean cross-fade is
an acceptable substitute — do not spend the budget here.

### 4. Compare

Pick two reports from one profile. Show:

- The two bodies, side by side.
- A metric table: metric, before, after, change, and both source classifications. Only
  rows where **both** reports contain the metric. Metrics present in only one report list
  separately as *"not measured in both reports"*.
- Regional comparison across trunk, both arms, both legs.

### 5. What changed

After a second report is verified: *"Your latest body snapshot is ready"*, then the largest
meaningful differences in measured values, before → after.

The accompanying explanation may describe **what** moved and may note that measurement
conditions, timing or a different device can affect comparability. It may not attribute
cause, infer behaviour, or project a trend. Two points are not a trajectory.

If the two reports come from different providers, say so explicitly — different devices
may use different methods and are not always directly comparable.

### 6. Metric history

"How has it changed?" in the detail panel activates: the metric's measured values with
their dates, and the real gaps between them. Two points, plotted honestly.

## Acceptance checks

1. A second report for the same subject joins the timeline; the body updates to the newer
   snapshot.
2. A report for a different subject does **not** join it — it prompts for a new profile,
   and each profile keeps a separate timeline.
3. Switching snapshots changes the body in ways traceable to changed measurements.
4. The comparison table excludes metrics missing from either report and says so.
5. The date gap between reports is shown literally. No interpolated point appears on any
   chart or in any readable value.
6. "What changed" states differences without asserting a cause.
7. Full loop end to end: upload → verify → body → click region → explain → second upload →
   compare → understand what changed.

## Do not build in this stage

Natural-language Q&A. Wearables, bloodwork or clinical report types. Predictions,
projections or goal tracking. Anything from the future-phases section of the PRD.

---

## When this stage passes

The core loop is complete. Stop, and let me look at it before anything else is added.
