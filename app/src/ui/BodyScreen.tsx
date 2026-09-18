import { useMemo, useState } from 'react';
import type { Metric, Profile } from '../lib/db';
import { buildBodyModel, type MetricValues, type RegionId } from '../lib/bodyModel';
import { BodyView, type CameraPreset, type Layer } from './BodyView';
import { Panel, ProvenanceTag, SourceLabel } from './primitives';

const LAYERS: { id: Layer; label: string }[] = [
  { id: 'normal', label: 'Body' },
  { id: 'fat', label: 'Fat' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'balance', label: 'Balance' },
];

const PRESETS: CameraPreset[] = ['front', 'back', 'left', 'right'];

const REGION_METRICS: Record<string, { muscle: string; fat: string; ratio: string }> = {
  trunk: {
    muscle: 'trunk_muscle_mass',
    fat: 'trunk_fat_mass',
    ratio: 'trunk_muscle_fat_ratio',
  },
  left_arm: {
    muscle: 'left_arm_muscle_mass',
    fat: 'left_arm_fat_mass',
    ratio: 'left_arm_muscle_fat_ratio',
  },
  right_arm: {
    muscle: 'right_arm_muscle_mass',
    fat: 'right_arm_fat_mass',
    ratio: 'right_arm_muscle_fat_ratio',
  },
  left_leg: {
    muscle: 'left_leg_muscle_mass',
    fat: 'left_leg_fat_mass',
    ratio: 'left_leg_muscle_fat_ratio',
  },
  right_leg: {
    muscle: 'right_leg_muscle_mass',
    fat: 'right_leg_fat_mass',
    ratio: 'right_leg_muscle_fat_ratio',
  },
};

const LAYER_NOTE: Record<Layer, string> = {
  normal: 'Shape and volume come from the fat and muscle masses in your report.',
  fat: 'Colour shows each region’s fat share, compared against your own other regions.',
  muscle: 'The inner form is the muscle volume your report measured for each region.',
  balance: 'Highlights measured left/right differences in muscle mass.',
};

export function BodyScreen({
  profile,
  metrics,
  measurementDate,
}: {
  profile: Profile;
  metrics: Metric[];
  measurementDate: string | null;
}) {
  const [layer, setLayer] = useState<Layer>('normal');
  const [preset, setPreset] = useState<CameraPreset>('front');
  const [selected, setSelected] = useState<RegionId | null>(null);
  const [showProvenance, setShowProvenance] = useState(false);

  const byName = useMemo(() => new Map(metrics.map((m) => [m.canonical_name, m])), [metrics]);

  const model = useMemo(() => {
    const values: MetricValues = {};
    for (const m of metrics) {
      if (typeof m.value === 'number') values[m.canonical_name] = m.value;
    }
    return buildBodyModel(values, profile.height_cm ?? 170);
  }, [metrics, profile.height_cm]);

  const headline = ['weight', 'fat_percentage', 'skeletal_muscle_mass', 'water_percentage']
    .map((n) => byName.get(n))
    .filter((m): m is Metric => Boolean(m));

  const segment = selected ? model.segments.find((s) => s.id === selected) : null;
  const regionMetrics = selected ? REGION_METRICS[selected] : undefined;

  return (
    <div className="flex h-[calc(100vh-65px)] flex-col">
      <div className="relative flex-1">
        <BodyView
          model={model}
          layer={layer}
          selected={selected}
          onSelect={setSelected}
          preset={preset}
        />

        <div className="pointer-events-none absolute left-6 top-6">
          <div className="text-sm text-atlas-muted">{profile.subject_name}</div>
          <div className="text-xs text-atlas-muted/60">
            {measurementDate
              ? new Date(measurementDate).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : ''}
          </div>
        </div>

        <div className="absolute left-1/2 top-6 flex -translate-x-1/2 gap-1 rounded-full border border-atlas-line bg-atlas-panel/80 p-1 backdrop-blur">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              data-testid={`layer-${l.id}`}
              onClick={() => setLayer(l.id)}
              className={`rounded-full px-4 py-1.5 text-xs transition ${
                layer === l.id
                  ? 'bg-atlas-accent text-atlas-bg'
                  : 'text-atlas-muted hover:text-atlas-text'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-atlas-line bg-atlas-panel/80 p-1 backdrop-blur">
          {PRESETS.map((p) => (
            <button
              key={p}
              data-testid={`view-${p}`}
              onClick={() => setPreset(p)}
              className={`rounded-full px-4 py-1.5 text-xs capitalize transition ${
                preset === p ? 'text-atlas-text' : 'text-atlas-muted hover:text-atlas-text'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Never let the picture imply more than the data supports. */}
        <div className="pointer-events-none absolute bottom-6 left-6 max-w-xs text-xs leading-relaxed text-atlas-muted/70">
          Generated from your measurements. Not a scan of your anatomy.
          <div className="mt-1 text-atlas-muted/50">{LAYER_NOTE[layer]}</div>
        </div>

        <button
          onClick={() => setShowProvenance((v) => !v)}
          data-testid="provenance-toggle"
          className="absolute bottom-6 right-6 rounded-lg border border-atlas-line bg-atlas-panel/80 px-3 py-1.5 text-xs text-atlas-muted backdrop-blur hover:text-atlas-text"
        >
          What is real here?
        </button>

        {showProvenance && (
          <Panel className="absolute bottom-20 right-6 w-80 space-y-3 bg-atlas-panel/95 p-5 text-xs backdrop-blur">
            <div className="flex gap-3">
              <ProvenanceTag level="measured" />
              <span className="text-atlas-muted">
                Fat and muscle mass for trunk, arms and legs — read from your report.
              </span>
            </div>
            <div className="flex gap-3">
              <ProvenanceTag level="derived" />
              <span className="text-atlas-muted">
                Each region’s volume and thickness, computed from those masses using tissue
                density. Your height, from weight and BMI.
              </span>
            </div>
            <div className="flex gap-3">
              <ProvenanceTag level="illustrative" />
              <span className="text-atlas-muted">
                Limb and torso proportions, and the shape along each segment. Head, neck,
                hands and feet — your report does not measure them.
              </span>
            </div>
            <div className="border-t border-atlas-line pt-3 text-atlas-muted/70">
              Measured regions account for {Math.round(model.coverage * 100)}% of your
              body’s estimated volume.
            </div>
          </Panel>
        )}

        {segment && (
          <Panel
            data-testid="region-panel"
            className="absolute right-6 top-6 w-80 bg-atlas-panel/95 p-6 backdrop-blur"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg">{segment.label}</h2>
              <button
                onClick={() => setSelected(null)}
                className="text-atlas-muted hover:text-atlas-text"
              >
                ✕
              </button>
            </div>

            {segment.measured && regionMetrics ? (
              <>
                <dl className="mt-5 space-y-4">
                  {[
                    ['Muscle', regionMetrics.muscle],
                    ['Fat', regionMetrics.fat],
                    ['Muscle-to-fat ratio', regionMetrics.ratio],
                  ].map(([label, key]) => {
                    const m = byName.get(key);
                    if (!m) return null;
                    return (
                      <div key={key}>
                        <dt className="text-xs uppercase tracking-wider text-atlas-muted">
                          {label}
                        </dt>
                        <dd className="mt-1 flex items-baseline gap-2">
                          <span className="text-2xl font-light">{m.value}</span>
                          <span className="text-sm text-atlas-muted">{m.unit ?? ''}</span>
                        </dd>
                        <dd className="mt-1.5 text-xs text-atlas-muted">
                          <SourceLabel label={m.source_classification} />
                          {m.source_classification && (
                            <span className="ml-2">according to your report</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>

                <button
                  disabled
                  className="mt-6 w-full cursor-not-allowed rounded-lg border border-atlas-line py-2 text-sm text-atlas-muted/50"
                >
                  Explain these numbers
                </button>
              </>
            ) : (
              <p className="mt-5 text-sm text-atlas-muted">
                Not measured in this report. Your scan records fat and muscle for the trunk,
                arms and legs only.
              </p>
            )}
          </Panel>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-2 border-t border-atlas-line lg:grid-cols-4">
        {headline.map((m) => (
          <div key={m.canonical_name} className="border-r border-atlas-line px-6 py-4 last:border-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-light">{m.value}</span>
              <span className="text-sm text-atlas-muted">{m.unit}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-atlas-muted">
                {m.display_name}
              </span>
              <SourceLabel label={m.source_classification} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
