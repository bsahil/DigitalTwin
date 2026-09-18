import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, type Category } from '../lib/catalog';
import type { ParsedMetric, ParsedReport } from '../lib/parser';
import { Button, Panel, ProvenanceTag } from './primitives';

export interface DraftMetric extends ParsedMetric {
  edited_by_user: boolean;
}

export function VerifyScreen({
  parsed,
  drafts,
  onChange,
  heightCm,
  heightEdited,
  onHeightChange,
  onConfirm,
  subjectName,
}: {
  parsed: ParsedReport;
  drafts: DraftMetric[];
  onChange: (index: number, patch: Partial<DraftMetric>) => void;
  heightCm: number | null;
  heightEdited: boolean;
  onHeightChange: (cm: number) => void;
  onConfirm: () => void;
  subjectName: string | null;
}) {
  const [editing, setEditing] = useState(false);

  // Counts come from what was actually parsed, never from a template.
  const counts = useMemo(() => {
    const map = new Map<Category, number>();
    for (const m of drafts) map.set(m.category, (map.get(m.category) ?? 0) + 1);
    return [...map.entries()];
  }, [drafts]);

  const lowConfidence = drafts.filter((d) => d.confidence === 'low').length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <h1 className="text-4xl font-light tracking-tight">
        We found {drafts.length} measurements
      </h1>
      <p className="mt-3 text-atlas-muted">
        {subjectName ?? 'Unknown subject'} · {parsed.provider} ·{' '}
        {parsed.measurement_date ?? 'date not found'}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map(([category, n]) => (
          <Panel key={category} className="p-4">
            <div className="text-2xl font-light">{n}</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-atlas-muted">
              {CATEGORY_LABELS[category]}
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="mt-6 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-atlas-muted">Height</span>
              <ProvenanceTag level={heightEdited ? 'measured' : 'derived'} />
            </div>
            <p className="mt-1 max-w-md text-xs text-atlas-muted/80">
              Your report does not print a height. This is calculated from your weight and
              BMI — correct it if you know the real figure.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              data-testid="height-input"
              value={heightCm ?? ''}
              onChange={(e) => onHeightChange(Number(e.target.value))}
              className="w-28 rounded-lg border border-atlas-line bg-atlas-bg px-3 py-2 text-right text-sm outline-none focus:border-atlas-accent"
            />
            <span className="text-sm text-atlas-muted">cm</span>
          </div>
        </div>
      </Panel>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-wider text-atlas-muted">
          Extracted measurements
          {lowConfidence > 0 && (
            <span className="ml-3 rounded border border-amber-400/30 bg-amber-400/5 px-2 py-0.5 text-[11px] normal-case tracking-normal text-amber-300">
              {lowConfidence} need checking
            </span>
          )}
        </h2>
        <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Done editing' : 'Edit extracted data'}
        </Button>
      </div>

      <Panel className="mt-4 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-atlas-line text-left text-xs uppercase tracking-wider text-atlas-muted">
              <th className="px-4 py-3 font-normal">Metric</th>
              <th className="px-4 py-3 font-normal">Value</th>
              <th className="px-4 py-3 font-normal">Unit</th>
              <th className="px-4 py-3 font-normal">Source status</th>
              <th className="px-4 py-3 text-right font-normal">Page</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((m, i) => (
              <tr
                key={m.canonical_name}
                data-testid={`row-${m.canonical_name}`}
                className={`border-b border-atlas-line/50 last:border-0 ${
                  m.confidence === 'low' ? 'bg-amber-400/5' : ''
                }`}
              >
                <td className="px-4 py-2.5">
                  {m.display_name}
                  {m.edited_by_user && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-300">
                      edited
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono">
                  {editing ? (
                    <input
                      value={String(m.value)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = Number(raw);
                        onChange(i, {
                          value: raw !== '' && !Number.isNaN(num) ? num : raw,
                          edited_by_user: true,
                          confidence: 'high',
                        });
                      }}
                      className="w-24 rounded border border-atlas-line bg-atlas-bg px-2 py-1 outline-none focus:border-atlas-accent"
                    />
                  ) : (
                    String(m.value)
                  )}
                </td>
                <td className="px-4 py-2.5 text-atlas-muted">{m.unit ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {editing ? (
                    <input
                      value={m.source_classification ?? ''}
                      onChange={(e) =>
                        onChange(i, {
                          source_classification: e.target.value || null,
                          edited_by_user: true,
                        })
                      }
                      className="w-32 rounded border border-atlas-line bg-atlas-bg px-2 py-1 outline-none focus:border-atlas-accent"
                    />
                  ) : m.source_classification ? (
                    <span className="rounded border border-atlas-line px-2 py-0.5 text-xs text-atlas-muted">
                      {m.source_classification}
                    </span>
                  ) : (
                    <span className="text-atlas-muted/40">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-atlas-muted/60">{m.source_page}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {parsed.unmapped.length > 0 && (
        <Panel className="mt-6 p-5">
          <h3 className="text-sm uppercase tracking-wider text-atlas-muted">
            Other values found
          </h3>
          <p className="mt-2 text-xs text-atlas-muted/80">
            These were in your report but do not match a measurement this app knows. They
            are kept as they appear.
          </p>
          <ul className="mt-3 space-y-1 font-mono text-xs text-atlas-muted">
            {parsed.unmapped.map((u, i) => (
              <li key={i}>
                p{u.page} · {u.label}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mt-10 flex items-center gap-4">
        <Button onClick={onConfirm} disabled={!heightCm}>
          Confirm &amp; Build My Body
        </Button>
        {!heightCm && <span className="text-xs text-atlas-muted">Enter a height to continue.</span>}
      </div>
    </div>
  );
}
