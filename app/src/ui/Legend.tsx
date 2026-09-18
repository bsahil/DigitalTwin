import type { BodyModel } from '../lib/bodyModel';
import { COLORS, hex, type Layer } from './BodyView';

/** A ramp swatch built from the same two endpoints the geometry is coloured with. */
function Ramp({ from, to, steps = 6 }: { from: number; to: number; steps?: number }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full">
      {Array.from({ length: steps }, (_, i) => {
        const t = i / (steps - 1);
        const a = [(from >> 16) & 255, (from >> 8) & 255, from & 255];
        const b = [(to >> 16) & 255, (to >> 8) & 255, to & 255];
        const mix = a.map((v, j) => Math.round(v + (b[j] - v) * t));
        return (
          <span
            key={i}
            className="flex-1"
            style={{ background: `rgb(${mix[0]} ${mix[1]} ${mix[2]})` }}
          />
        );
      })}
    </div>
  );
}

function Scale({ low, high }: { low: string; high: string }) {
  return (
    <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-atlas-muted">
      <span>{low}</span>
      <span>{high}</span>
    </div>
  );
}

function Swatch({ color, label }: { color: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ background: hex(color) }}
        aria-hidden
      />
      <span className="text-[11px] text-atlas-muted">{label}</span>
    </div>
  );
}

/**
 * Colour on the body encodes magnitude, so it needs a key. Ranges are this person's
 * own minimum and maximum across their measured regions — never a population norm.
 */
export function Legend({ layer, model }: { layer: Layer; model: BodyModel }) {
  const measured = model.segments.filter((s) => s.measured);
  if (measured.length === 0) return null;

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const range = (values: number[]) => [Math.min(...values), Math.max(...values)] as const;

  if (layer === 'fat') {
    const [lo, hi] = range(measured.map((s) => s.fatShare));
    return (
      <Wrapper title="Fat share of region">
        <Ramp from={COLORS.neutral} to={COLORS.fat} />
        <Scale low={pct(lo)} high={pct(hi)} />
        <p className="mt-2 text-[10px] leading-relaxed text-atlas-muted/70">
          Shaded across your own regions. The trunk also shows visceral fat as an inner
          core.
        </p>
      </Wrapper>
    );
  }

  if (layer === 'muscle') {
    const [lo, hi] = range(measured.map((s) => s.muscleShare));
    return (
      <Wrapper title="Muscle share of region">
        <Ramp from={COLORS.neutral} to={COLORS.muscle} />
        <Scale low={pct(lo)} high={pct(hi)} />
        <p className="mt-2 text-[10px] leading-relaxed text-atlas-muted/70">
          The solid inner form is the measured muscle volume.
        </p>
      </Wrapper>
    );
  }

  if (layer === 'balance') {
    const worst = Math.max(Math.abs(model.asymmetry.arms), Math.abs(model.asymmetry.legs));
    const edge = Math.max(1, Math.round(worst * 100));
    return (
      <Wrapper title="Left / right muscle difference">
        <div className="flex h-2 overflow-hidden rounded-full">
          <span className="flex-1" style={{ background: hex(COLORS.balanceLow) }} />
          <span className="flex-1" style={{ background: hex(COLORS.balanceMid) }} />
          <span className="flex-1" style={{ background: hex(COLORS.balanceHigh) }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-atlas-muted">
          <span>−{edge}% lighter</span>
          <span>equal</span>
          <span>+{edge}% heavier</span>
        </div>
      </Wrapper>
    );
  }

  if (layer === 'inside') {
    return (
      <Wrapper title="Cut through the body">
        <div className="space-y-1.5">
          <Swatch color={COLORS.fat} label="Subcutaneous fat" />
          <Swatch color={COLORS.muscle} label="Muscle and lean tissue" />
          <Swatch color={COLORS.visceral} label="Visceral fat (trunk only)" />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-atlas-muted/70">
          Each band holds the volume its measured mass implies. Where the visceral core
          sits inside the trunk is illustrative — your scan measures the amount, not the
          location.
        </p>
      </Wrapper>
    );
  }

  return null;
}

function Wrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      data-testid="legend"
      className="w-56 rounded-xl border border-atlas-line bg-atlas-panel/85 p-3 backdrop-blur"
    >
      <div className="mb-2 text-[10px] uppercase tracking-wider text-atlas-muted">{title}</div>
      {children}
    </div>
  );
}
