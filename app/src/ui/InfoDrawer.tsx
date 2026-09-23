import { useState } from 'react';
import type { Metric } from '../lib/db';
import type { Standout } from '../lib/standout';
import { SourceLabel } from './primitives';
import { StandoutStrip } from './StandoutStrip';

/**
 * The headline numbers and "what stands out" used to sit permanently below the body,
 * pushing the 3D view into a fraction of the screen. They still exist in full — this
 * just keeps them collapsed to one line until asked for, so the body is what fills
 * the page.
 */
export function InfoDrawer({
  headline,
  standouts,
  onOpen,
}: {
  headline: Metric[];
  standouts: Standout[];
  onOpen: (canonicalName: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const summary = headline
    .map((m) => `${m.value}${m.unit ? ` ${m.unit}` : ''} ${m.display_name.toLowerCase()}`)
    .join(' · ');
  const standoutNote = standouts.length > 0 ? ` · ${standouts.length} thing${standouts.length === 1 ? '' : 's'} stand out` : '';

  return (
    <div className="shrink-0 border-t border-atlas-line">
      <button
        data-testid="info-drawer-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs text-atlas-muted transition hover:text-atlas-text sm:px-6"
      >
        <span className="min-w-0 flex-1 truncate">
          {summary}
          <span className="text-atlas-muted/60">{standoutNote}</span>
        </span>
        <span aria-hidden className="shrink-0 text-atlas-muted/60">
          {open ? 'Hide ▲' : 'Details ▼'}
        </span>
      </button>

      {open && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-atlas-line">
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {headline.map((m) => (
              <button
                key={m.canonical_name}
                data-testid={`headline-${m.canonical_name}`}
                onClick={() => onOpen(m.canonical_name)}
                className="border-r border-b border-atlas-line px-6 py-4 text-left transition last:border-r-0 hover:bg-atlas-panel/60"
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

          <StandoutStrip items={standouts} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}
