import { useMemo, useState } from 'react';
import type { Metric, Profile } from '../lib/db';
import type { ReportNarrative } from '../lib/parser';
import { buildBodyModel, type MetricValues, type RegionId, type Segment } from '../lib/bodyModel';
import { runDataCheck, type CheckMetric } from '../lib/dataCheck';
import { BodyView, type CameraPreset, type Layer } from './BodyView';
import { MetricPanel } from './MetricPanel';
import { DataCheckPanel } from './DataCheckPanel';
import { Legend } from './Legend';
import { Panel, ProvenanceTag, SourceLabel } from './primitives';

const LAYERS: { id: Layer; label: string }[] = [
  { id: 'normal', label: 'Body' },
  { id: 'fat', label: 'Fat' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'balance', label: 'Balance' },
  { id: 'inside', label: 'Inside' },
];

const PRESETS: CameraPreset[] = ['front', 'back', 'left', 'right'];

const REGION_METRICS: Record<string, { muscle: string; fat: string; ratio: string }> = {
  trunk: { muscle: 'trunk_muscle_mass', fat: 'trunk_fat_mass', ratio: 'trunk_muscle_fat_ratio' },
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
  inside: 'Cut through the body to see the compartments your report measured.',
};

export function BodyScreen({
  profile,
  metrics,
  measurementDate,
  narrative,
  provider,
}: {
  profile: Profile;
  metrics: Metric[];
  measurementDate: string | null;
  narrative: ReportNarrative | null;
  provider: string;
}) {
  const [layer, setLayer] = useState<Layer>('normal');
  const [preset, setPreset] = useState<CameraPreset>('front');
  const [selected, setSelected] = useState<RegionId | null>(null);
  const [openMetric, setOpenMetric] = useState<string | null>(null);
  const [showDataCheck, setShowDataCheck] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  const byName = useMemo(() => new Map(metrics.map((m) => [m.canonical_name, m])), [metrics]);

  const model = useMemo(() => {
    const values: MetricValues = {};
    for (const m of metrics) {
      if (typeof m.value === 'number') values[m.canonical_name] = m.value;
    }
    return buildBodyModel(values, profile.height_cm ?? 170);
  }, [metrics, profile.height_cm]);

  const flags = useMemo(() => {
    const input: CheckMetric[] = metrics.map((m) => ({
      canonical_name: m.canonical_name,
      display_name: m.display_name,
      value: m.value,
      unit: m.unit,
      source_classification: m.source_classification,
    }));
    return runDataCheck(input, narrative ?? undefined);
  }, [metrics, narrative]);

  const headline = ['weight', 'fat_percentage', 'skeletal_muscle_mass', 'water_percentage']
    .map((n) => byName.get(n))
    .filter((m): m is Metric => Boolean(m));

  const kg = (n: number) => `${n.toFixed(1)} kg`;

  function labelFor(segment: Segment): string {
    if (!segment.measured) return `${segment.label} · not measured`;

    const { lean, fat, visceral } = segment.mass;
    const pct = (n: number) => `${Math.round(n * 100)}%`;

    if (layer === 'fat') {
      return `${segment.label} · fat ${kg(fat + (visceral ?? 0))} · ${pct(segment.fatShare)} of region`;
    }
    if (layer === 'muscle') {
      return `${segment.label} · muscle ${kg(lean)} · ${pct(segment.muscleShare)} of region`;
    }
    if (layer === 'inside') {
      return visceral
        ? `${segment.label} · muscle ${kg(lean)} · fat ${kg(fat)} · visceral ${kg(visceral)}`
        : `${segment.label} · muscle ${kg(lean)} · fat ${kg(fat)}`;
    }
    if (layer === 'balance') {
      const pair = segment.id.includes('arm') ? model.asymmetry.arms : segment.id.includes('leg') ? model.asymmetry.legs : 0;
      if (pair === 0) return `${segment.label} · no left/right pair`;
      const heavier = pair > 0 ? 'left' : 'right';
      const share = Math.abs(pair) * 100;
      return `${segment.label} · ${segment.id.startsWith(heavier) ? 'heavier' : 'lighter'} side by ${share.toFixed(1)}%`;
    }
    return `${segment.label} · muscle ${kg(lean)} · fat ${kg(fat + (visceral ?? 0))}`;
  }

  const segment = selected ? model.segments.find((s) => s.id === selected) : null;
  const regionMetrics = selected ? REGION_METRICS[selected] : undefined;

  function open(canonicalName: string) {
    setOpenMetric(canonicalName);
    setShowDataCheck(false);

    // Keep the body highlighted only while the open metric belongs to that region,
    // so a whole-body measurement never appears to point at one limb.
    const region = selected ? REGION_METRICS[selected] : undefined;
    if (region && !Object.values(region).includes(canonicalName)) setSelected(null);
  }

  const drawer = openMetric
    ? 'metric'
    : showDataCheck
      ? 'check'
      : segment
        ? 'region'
        : null;

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1">
        {/* min-w-0: the canvas carries an inline pixel width, which would otherwise set
            min-width:auto on this flex item and push the drawer off screen. */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <BodyView
            model={model}
            layer={layer}
            selected={selected}
            onSelect={setSelected}
            preset={preset}
            labelFor={labelFor}
          />

          <div className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6">
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

          {flags.length > 0 && (
            <button
              data-testid="data-check-button"
              onClick={() => {
                setShowDataCheck(true);
                setOpenMetric(null);
              }}
              className="absolute right-4 top-4 rounded-lg border border-atlas-line bg-atlas-panel/80 px-3 py-2 text-xs text-atlas-muted backdrop-blur transition hover:text-atlas-text sm:right-6 sm:top-6"
            >
              Data check · {flags.length}
            </button>
          )}

          <div className="absolute left-1/2 top-16 flex -translate-x-1/2 gap-1 rounded-full border border-atlas-line bg-atlas-panel/80 p-1 backdrop-blur sm:top-6">
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

          <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-atlas-line bg-atlas-panel/80 p-1 backdrop-blur sm:bottom-6">
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
          <div className="pointer-events-none absolute bottom-4 left-4 max-w-[58%] text-xs leading-relaxed text-atlas-muted/70 sm:bottom-6 sm:left-6 sm:max-w-xs">
            Generated from your measurements. Not a scan of your anatomy.
            <div className="mt-1 hidden text-atlas-muted/50 sm:block">{LAYER_NOTE[layer]}</div>
          </div>

          <div className="pointer-events-none absolute right-4 top-16 sm:right-6 sm:top-20">
            <Legend layer={layer} model={model} />
          </div>

          <button
            onClick={() => setShowProvenance((v) => !v)}
            data-testid="provenance-toggle"
            className="absolute bottom-4 right-4 rounded-lg border border-atlas-line bg-atlas-panel/80 px-3 py-1.5 text-xs text-atlas-muted backdrop-blur hover:text-atlas-text sm:bottom-6 sm:right-6"
          >
            What is real here?
          </button>

          {showProvenance && (
            <Panel className="absolute bottom-16 right-4 w-80 max-w-[calc(100vw-2rem)] space-y-3 bg-atlas-panel/95 p-5 text-xs backdrop-blur sm:bottom-20 sm:right-6">
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
                Measured regions account for {Math.round(model.coverage * 100)}% of your body’s
                estimated volume.
              </div>
            </Panel>
          )}
        </div>

        {drawer && (
          <aside className="absolute inset-0 z-20 lg:static lg:z-auto lg:w-[26rem] lg:shrink-0">
            {drawer === 'metric' && byName.get(openMetric!) && (
              <MetricPanel
                metric={byName.get(openMetric!)!}
                allMetrics={metrics}
                flags={flags}
                onNavigate={open}
                onClose={() => setOpenMetric(null)}
              />
            )}

            {drawer === 'check' && (
              <DataCheckPanel
                flags={flags}
                narrative={narrative}
                provider={provider}
                onClose={() => setShowDataCheck(false)}
                onOpenMetric={open}
              />
            )}

            {drawer === 'region' && segment && (
              <div
                data-testid="region-panel"
                className="h-full overflow-y-auto border-l border-atlas-line bg-atlas-panel/95 px-7 py-6 backdrop-blur"
              >
                <div className="flex items-start justify-between">
                  <h2 className="text-xl">{segment.label}</h2>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-atlas-muted hover:text-atlas-text"
                  >
                    ✕
                  </button>
                </div>

                {segment.measured && regionMetrics ? (
                  <>
                    <p className="mt-2 text-xs text-atlas-muted">
                      Select a measurement to see what it means.
                    </p>
                    <p
                      data-testid="region-volume"
                      className="mt-3 flex items-baseline gap-2 text-sm"
                    >
                      <span className="text-atlas-muted">Drawn at</span>
                      <span className="font-mono">{segment.volumeL.toFixed(1)} L</span>
                      <span className="text-xs text-atlas-muted">
                        — the volume its measured fat and muscle imply
                      </span>
                    </p>
                    <div className="mt-5 space-y-2">
                      {[
                        ['Muscle', regionMetrics.muscle],
                        ['Fat', regionMetrics.fat],
                        ['Muscle-to-fat ratio', regionMetrics.ratio],
                      ].map(([label, key]) => {
                        const m = byName.get(key);
                        if (!m) return null;
                        return (
                          <button
                            key={key}
                            data-testid={`region-metric-${key}`}
                            onClick={() => open(key)}
                            className="w-full rounded-lg border border-atlas-line p-4 text-left transition hover:border-atlas-accent/50"
                          >
                            <div className="text-xs uppercase tracking-wider text-atlas-muted">
                              {label}
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-2xl font-light">{m.value}</span>
                              <span className="text-sm text-atlas-muted">{m.unit ?? ''}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-xs text-atlas-muted">
                              <SourceLabel label={m.source_classification} />
                              {m.source_classification && <span>according to your report</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      data-testid="explain-region"
                      onClick={() => open(regionMetrics.muscle)}
                      className="mt-6 w-full rounded-lg bg-atlas-accent py-2.5 text-sm font-medium text-atlas-bg transition hover:brightness-110"
                    >
                      Explain these numbers
                    </button>
                  </>
                ) : (
                  <p className="mt-5 text-sm leading-relaxed text-atlas-muted">
                    Not measured in this report. Your scan records fat and muscle for the trunk,
                    arms and legs only.
                  </p>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-2 border-t border-atlas-line lg:grid-cols-4">
        {headline.map((m) => (
          <button
            key={m.canonical_name}
            data-testid={`headline-${m.canonical_name}`}
            onClick={() => open(m.canonical_name)}
            className="border-r border-atlas-line px-6 py-4 text-left transition last:border-0 hover:bg-atlas-panel/60"
          >
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
          </button>
        ))}
      </div>
    </div>
  );
}
