import { CATEGORY_LABELS, byCatalogOrder, type Category } from '../lib/catalog';
import type { ParsedReport } from '../lib/parser';
import type { Metric, Profile, Report } from '../lib/db';
import { Button, Panel, ProvenanceTag, SourceLabel } from './primitives';

/**
 * The app cannot know whose report a file is, so it never decides. Merging two people
 * into one timeline would produce a record that is simply untrue.
 */
export function SubjectCheckScreen({
  parsed,
  existing,
  onCreate,
  onAttach,
  onCancel,
}: {
  parsed: ParsedReport;
  existing: Profile[];
  onCreate: () => void;
  onAttach: (p: Profile) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-6 py-24">
      <h1 className="text-3xl font-light tracking-tight">
        This report looks like it&apos;s for a different person.
      </h1>
      <Panel className="mt-8 p-5">
        <div className="text-xs uppercase tracking-wider text-atlas-muted">This report</div>
        <div className="mt-2 text-lg">
          {parsed.subject_name ?? 'Unnamed'}
          <span className="ml-3 text-sm text-atlas-muted">
            {parsed.age ? `${parsed.age} yrs` : ''} {parsed.sex ?? ''}
          </span>
        </div>
      </Panel>

      <p className="mt-6 text-sm text-atlas-muted">
        Reports from different people are kept in separate profiles, each with its own
        timeline. Adding this to an existing profile would treat two people&apos;s
        measurements as one body changing over time.
      </p>

      <div className="mt-8 space-y-3">
        <Button onClick={onCreate}>Create a new profile</Button>
        {existing.map((p) => (
          <div key={p.id}>
            <Button variant="ghost" onClick={() => onAttach(p)}>
              Add to {p.subject_name ?? 'existing profile'} anyway
            </Button>
          </div>
        ))}
        <div>
          <Button variant="danger" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DataReadyScreen({
  profile,
  metrics,
  onUploadAnother,
}: {
  profile: Profile;
  metrics: Metric[];
  onUploadAnother: () => void;
}) {
  const byCategory = new Map<Category, Metric[]>();
  for (const m of [...metrics].sort(byCatalogOrder)) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }

  const headline = ['weight', 'fat_percentage', 'skeletal_muscle_mass', 'water_percentage']
    .map((n) => metrics.find((m) => m.canonical_name === n))
    .filter((m): m is Metric => Boolean(m));

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <h1 className="text-4xl font-light tracking-tight">Your data is ready</h1>
      <p className="mt-3 text-atlas-muted">
        {profile.subject_name} · {metrics.length} verified measurements · height{' '}
        {profile.height_cm} cm{' '}
        <ProvenanceTag level={profile.height_provenance === 'measured' ? 'measured' : 'derived'} />
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {headline.map((m) => (
          <Panel key={m.canonical_name} className="p-5">
            <div className="text-3xl font-light">
              {m.value}
              <span className="ml-1 text-base text-atlas-muted">{m.unit}</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-atlas-muted">
              {m.display_name}
            </div>
            <div className="mt-3">
              <SourceLabel label={m.source_classification} />
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="mt-6 border-dashed p-8 text-center">
        <p className="text-atlas-muted">
          Your body model arrives in the next stage. These measurements are what will
          generate it.
        </p>
      </Panel>

      <div className="mt-12 space-y-8">
        {[...byCategory.entries()].map(([category, list]) => (
          <div key={category}>
            <h2 className="text-sm uppercase tracking-wider text-atlas-muted">
              {CATEGORY_LABELS[category]}{' '}
              <span className="text-atlas-muted/50">{list.length}</span>
            </h2>
            <Panel className="mt-3 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {list.map((m) => (
                    <tr key={m.id} className="border-b border-atlas-line/50 last:border-0">
                      <td className="px-4 py-2.5">{m.display_name}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {m.value}
                        <span className="ml-1 text-atlas-muted">{m.unit ?? ''}</span>
                      </td>
                      <td className="w-40 px-4 py-2.5 text-right">
                        <SourceLabel label={m.source_classification} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        ))}
      </div>

      <div className="mt-12">
        <Button variant="ghost" onClick={onUploadAnother}>
          Upload another report
        </Button>
      </div>
    </div>
  );
}

export function ReportsScreen({
  reports,
  profiles,
  onDelete,
  onUpload,
}: {
  reports: Report[];
  profiles: Profile[];
  onDelete: (id: string) => void;
  onUpload: () => void;
}) {
  const nameFor = (id: string) =>
    profiles.find((p) => p.id === id)?.subject_name ?? 'Unknown profile';

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-light tracking-tight">My reports</h1>
        <Button onClick={onUpload}>Upload report</Button>
      </div>

      {reports.length === 0 ? (
        <Panel className="mt-10 p-12 text-center text-atlas-muted">
          No reports yet.
        </Panel>
      ) : (
        <div className="mt-8 space-y-3">
          {reports.map((r) => (
            <Panel key={r.id} className="flex items-center gap-4 p-5">
              <div className="min-w-0">
                <div className="truncate">
                  {new Date(r.measurement_date).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                  <span className="ml-3 text-sm text-atlas-muted">{nameFor(r.profile_id)}</span>
                </div>
                <div className="mt-1 text-xs text-atlas-muted">
                  {r.provider} body scan · {r.metric_count} measurements · {r.extraction_status}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    const url = URL.createObjectURL(r.original_file);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = r.file_name;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  View original
                </Button>
                <Button variant="danger" onClick={() => onDelete(r.id)}>
                  Delete
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
