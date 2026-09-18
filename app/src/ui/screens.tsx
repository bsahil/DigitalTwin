import type { ParsedReport } from '../lib/parser';
import type { Profile, Report } from '../lib/db';
import { Button, Panel } from './primitives';

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


export function ReportsScreen({
  reports,
  profiles,
  onDelete,
  onUpload,
  onEdit,
}: {
  reports: Report[];
  profiles: Profile[];
  onDelete: (id: string) => void;
  onUpload: () => void;
  onEdit?: (report: Report) => void;
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
                  {r.report_type === 'self_report'
                    ? `Self-reported · ${r.metric_count} values`
                    : `${r.provider} body scan · ${r.metric_count} measurements · ${r.extraction_status}`}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {r.original_file ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const url = URL.createObjectURL(r.original_file!);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = r.file_name ?? 'report.pdf';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    View original
                  </Button>
                ) : (
                  r.answers &&
                  onEdit && (
                    <Button variant="ghost" data-testid={`edit-answers-${r.id}`} onClick={() => onEdit(r)}>
                      Edit answers
                    </Button>
                  )
                )}
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
