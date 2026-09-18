import type { Flag, RuleId } from '../lib/dataCheck';
import type { ReportNarrative } from '../lib/parser';

const GROUPS: { rule: RuleId; title: string; lead: string }[] = [
  {
    rule: 'R1',
    title: 'The same thing, classified two ways',
    lead: 'These pairs describe the same tissue or the same quantity on two scales, but your report gives them different labels.',
  },
  {
    rule: 'R3',
    title: 'BMI against body fat',
    lead: 'Two measurements that describe different things and can reasonably land in different categories.',
  },
  {
    rule: 'R2',
    title: 'Where the summary and the tables disagree',
    lead: 'Your report’s written summary makes claims that its own measurement tables classify differently.',
  },
  {
    rule: 'R5',
    title: 'Symmetry score against the measured sides',
    lead: 'A summary score reads as balanced while the underlying side measurements differ.',
  },
];

export function DataCheckPanel({
  flags,
  narrative,
  provider,
  onClose,
  onOpenMetric,
}: {
  flags: Flag[];
  narrative: ReportNarrative | null;
  provider: string;
  onClose: () => void;
  onOpenMetric: (canonicalName: string) => void;
}) {
  const fromExtraction = flags.filter((f) => f.origin === 'extraction');

  return (
    <div
      data-testid="data-check-panel"
      className="flex h-full flex-col overflow-y-auto border-l border-atlas-line bg-atlas-panel/95 backdrop-blur"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-atlas-line bg-atlas-panel/95 px-7 py-6 backdrop-blur">
        <div>
          <h2 className="text-xl">Data check</h2>
          <p className="mt-1 text-xs text-atlas-muted">
            {flags.length === 0
              ? 'Nothing to flag in this report.'
              : `${flags.length} place${flags.length === 1 ? '' : 's'} where this report disagrees with itself`}
          </p>
        </div>
        <button onClick={onClose} className="text-atlas-muted hover:text-atlas-text">
          ✕
        </button>
      </div>

      <div className="space-y-8 px-7 pb-10 pt-5">
        {flags.length > 0 && (
          <p className="text-sm leading-relaxed text-atlas-muted">
            None of this has been corrected or resolved. Both readings are kept exactly as your
            report gives them, because deciding which one is right would mean guessing at your
            provider’s definitions.
          </p>
        )}

        {GROUPS.map(({ rule, title, lead }) => {
          const group = flags.filter((f) => f.rule === rule && f.origin === 'source');
          if (group.length === 0) return null;

          return (
            <section key={rule}>
              <h3 className="text-xs uppercase tracking-wider text-atlas-muted">
                {title} <span className="text-atlas-muted/50">{group.length}</span>
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-atlas-muted/80">{lead}</p>

              <div className="mt-3 space-y-3">
                {group.map((flag) => (
                  <article
                    key={flag.id}
                    data-testid={`flag-${flag.rule}`}
                    className="rounded-xl border border-atlas-line bg-atlas-bg/40 p-4"
                  >
                    <h4 className="text-sm text-atlas-text">{flag.title}</h4>
                    <p className="mt-2 text-xs leading-relaxed text-atlas-muted">{flag.body}</p>

                    <div className="mt-3 space-y-1.5">
                      {flag.metrics.map((m) => (
                        <button
                          key={m.canonical_name}
                          data-testid={`flag-metric-${m.canonical_name}`}
                          onClick={() => onOpenMetric(m.canonical_name)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-atlas-line/70 px-3 py-2 text-left text-xs transition hover:border-atlas-accent/50"
                        >
                          <span>{m.display_name}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-atlas-text">
                              {m.value}
                              {m.unit ? ` ${m.unit}` : ''}
                            </span>
                            {m.source_classification && (
                              <span className="rounded border border-atlas-line px-1.5 py-0.5 text-atlas-muted">
                                {m.source_classification}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {fromExtraction.length > 0 && (
          <section>
            <h3 className="text-xs uppercase tracking-wider text-atlas-muted">
              Worth checking against your PDF{' '}
              <span className="text-atlas-muted/50">{fromExtraction.length}</span>
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-atlas-muted/80">
              These figures do not add up against each other. That can mean the extraction read
              something wrong, or that your provider calculated two figures on different
              definitions.
            </p>
            <div className="mt-3 space-y-3">
              {fromExtraction.map((flag) => (
                <article
                  key={flag.id}
                  data-testid={`flag-${flag.rule}`}
                  className="rounded-xl border border-atlas-line bg-atlas-bg/40 p-4"
                >
                  <h4 className="text-sm">{flag.title}</h4>
                  <p className="mt-2 text-xs leading-relaxed text-atlas-muted">{flag.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {narrative && narrative.recommendations.length > 0 && (
          <section className="border-t border-atlas-line pt-6">
            <h3 className="text-xs uppercase tracking-wider text-atlas-muted">
              What your report recommends
            </h3>
            <p className="mt-2 text-xs text-atlas-muted">
              Written by {provider}, reproduced here as given. Body Atlas does not generate
              recommendations of its own.
            </p>
            <ol className="mt-3 space-y-2.5">
              {narrative.recommendations.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-atlas-text/85">
                  <span className="text-atlas-muted">{i + 1}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
