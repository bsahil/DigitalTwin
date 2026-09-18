import { useMemo, useState } from 'react';
import type { Metric } from '../lib/db';
import { knowledgeFor, missingFor, relatedTo } from '../lib/knowledge';
import type { Flag } from '../lib/dataCheck';
import { SourceLabel } from './primitives';

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-atlas-line pt-5">
      <h3 className="flex items-center gap-2 text-xs uppercase tracking-wider text-atlas-muted">
        <span aria-hidden>{icon}</span>
        {title}
      </h3>
      <div className="mt-2.5 text-sm leading-relaxed text-atlas-text/85">{children}</div>
    </section>
  );
}

export function MetricPanel({
  metric,
  allMetrics,
  flags,
  onNavigate,
  onClose,
}: {
  metric: Metric;
  allMetrics: Metric[];
  flags: Flag[];
  onNavigate: (canonicalName: string) => void;
  onClose: () => void;
}) {
  const [plain, setPlain] = useState(false);
  const knowledge = knowledgeFor(metric.canonical_name);

  const available = useMemo(
    () => new Set(allMetrics.map((m) => m.canonical_name)),
    [allMetrics],
  );
  const byName = useMemo(
    () => new Map(allMetrics.map((m) => [m.canonical_name, m])),
    [allMetrics],
  );

  const related = relatedTo(metric.canonical_name, available);
  const missing = missingFor(metric.canonical_name);
  const relevantFlags = flags.filter((f) =>
    f.metrics.some((m) => m.canonical_name === metric.canonical_name),
  );

  return (
    <div
      data-testid="metric-panel"
      className="flex h-full flex-col overflow-y-auto border-l border-atlas-line bg-atlas-panel/95 backdrop-blur"
    >
      <div className="sticky top-0 z-10 border-b border-atlas-line bg-atlas-panel/95 px-7 py-6 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl">{metric.display_name}</h2>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-light">{metric.value}</span>
              <span className="text-atlas-muted">{metric.unit ?? ''}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-atlas-muted hover:text-atlas-text">
            ✕
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-atlas-muted">
          <SourceLabel label={metric.source_classification} />
          {metric.source_classification && <span>classification from your report</span>}
          {metric.edited_by_user && (
            <span className="rounded border border-sky-400/30 px-1.5 py-0.5 text-sky-300">
              edited by you
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 px-7 pb-10 pt-5">
        {knowledge ? (
          <>
            <section>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs uppercase tracking-wider text-atlas-muted">
                  <span aria-hidden>👁</span> What is this?
                </h3>
                <button
                  data-testid="plain-language-toggle"
                  onClick={() => setPlain((v) => !v)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    plain
                      ? 'border-atlas-accent/40 bg-atlas-accent/10 text-atlas-accent'
                      : 'border-atlas-line text-atlas-muted hover:text-atlas-text'
                  }`}
                >
                  In simple terms
                </button>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-atlas-text/85">
                {plain ? knowledge.plain_language : knowledge.definition}
              </p>
            </section>

            <Section icon="🧠" title="Why does it matter?">
              {knowledge.why_it_matters}
            </Section>

            <Section icon="📍" title="Your result">
              <p>
                Your report records{' '}
                <span className="text-atlas-text">
                  {metric.value} {metric.unit ?? ''}
                </span>
                {metric.source_classification ? (
                  <>
                    {' '}
                    and classifies it as{' '}
                    <span className="text-atlas-text">“{metric.source_classification}”</span>. That
                    word is your provider’s, on your provider’s scale — it is shown here exactly as
                    the report gives it, and not reinterpreted.
                  </>
                ) : (
                  <> without a classification of its own.</>
                )}
              </p>
              <p className="mt-2.5 text-atlas-muted">
                Reference range not provided in this report.
              </p>
              <p className="mt-2.5 text-atlas-muted">{knowledge.measurement_limitations}</p>
            </Section>

            {relevantFlags.length > 0 && (
              <Section icon="⚠" title="Data check">
                <ul className="space-y-3">
                  {relevantFlags.map((f) => (
                    <li key={f.id} className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
                      <div className="text-atlas-text">{f.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-atlas-muted">{f.body}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {related.length > 0 && (
              <Section icon="🔗" title="What is it connected to?">
                <div className="space-y-4">
                  {related.map(({ cluster, members }) => (
                    <div key={cluster.id}>
                      <p className="text-xs text-atlas-muted">{cluster.why}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {members.map((name) => {
                          const m = byName.get(name)!;
                          return (
                            <button
                              key={name}
                              data-testid={`related-${name}`}
                              onClick={() => onNavigate(name)}
                              className="rounded-lg border border-atlas-line px-3 py-1.5 text-left text-xs transition hover:border-atlas-accent/50 hover:text-atlas-accent"
                            >
                              {m.display_name}{' '}
                              <span className="text-atlas-muted">
                                {m.value}
                                {m.unit ? ` ${m.unit}` : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {missing.length > 0 && (
              <Section icon="❓" title="What don’t we know?">
                <p className="text-atlas-muted">
                  Your scan measures body composition. These describe things it cannot.
                </p>
                <ul className="mt-3 space-y-2.5">
                  {missing.map((m) => (
                    <li key={m.id}>
                      <div className="text-atlas-text/90">{m.label}</div>
                      <p className="text-xs leading-relaxed text-atlas-muted">{m.context}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {knowledge.safety_note && (
              <Section icon="🛟" title="Worth knowing">
                <p className="text-atlas-muted">{knowledge.safety_note}</p>
              </Section>
            )}
          </>
        ) : (
          <p className="text-sm text-atlas-muted">
            No explanation is available for this measurement yet. Its value and your report’s
            classification are shown above exactly as extracted.
          </p>
        )}

        <Section icon="📈" title="How has it changed?">
          <p className="text-atlas-muted">
            Only one report is stored for this profile, so there is nothing to compare against
            yet. Upload a later scan to see this measurement over time.
          </p>
        </Section>
      </div>
    </div>
  );
}
