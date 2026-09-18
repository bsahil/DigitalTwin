import type { Standout } from '../lib/standout';

const TONE: Record<Standout['kind'], string> = {
  conflict: 'border-amber-400/30',
  divergence: 'border-sky-400/30',
  asymmetry: 'border-atlas-accent/30',
  provider: 'border-atlas-line',
};

/**
 * The few things worth seeing first. Each item is a flag, a measured difference, or the
 * provider's own quoted words — the strip adds no reading of its own.
 */
export function StandoutStrip({
  items,
  onOpen,
}: {
  items: Standout[];
  onOpen: (metric: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div data-testid="standout-strip" className="shrink-0 border-t border-atlas-line">
      <div className="flex flex-wrap items-baseline gap-x-3 px-4 pt-3 sm:px-6">
        <h2 className="text-[10px] uppercase tracking-wider text-atlas-muted">What stands out</h2>
        <span className="text-[10px] text-atlas-muted/60">
          From your report’s own numbers and words
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3 pt-2 sm:px-6 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {items.map((item) => {
          const body = (
            <>
              <div className="text-[10px] uppercase tracking-wider text-atlas-muted">
                {item.eyebrow}
              </div>
              <div
                className={`mt-0.5 text-sm leading-snug ${
                  item.kind === 'provider' ? 'italic text-atlas-text/80' : 'text-atlas-text'
                }`}
              >
                {item.kind === 'provider' ? `“${item.title}”` : item.title}
              </div>
              <div className="mt-0.5 text-xs text-atlas-muted">{item.detail}</div>
            </>
          );
          const className = `min-w-[15rem] shrink-0 rounded-lg border bg-atlas-panel/60 px-3 py-2 text-left lg:min-w-0 ${TONE[item.kind]}`;

          return item.metric ? (
            <button
              key={item.id}
              data-testid={`standout-${item.kind}`}
              onClick={() => onOpen(item.metric!)}
              className={`${className} transition hover:bg-atlas-panel`}
            >
              {body}
            </button>
          ) : (
            <div key={item.id} data-testid={`standout-${item.kind}`} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
