import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  commitReport,
  createProfile,
  db,
  deleteReport,
  matchProfile,
  uid,
  type Metric,
  type Profile,
  type Report as StoredReport,
} from './lib/db';
import { parsePdf, type ParsedReport } from './lib/parser';
import { UploadScreen } from './ui/UploadScreen';
import { ProcessingScreen, PROCESSING_STEPS } from './ui/ProcessingScreen';
import { VerifyScreen, type DraftMetric } from './ui/VerifyScreen';
import { ReportsScreen, SubjectCheckScreen } from './ui/screens';
import { BodyScreen } from './ui/BodyScreen';

type View = 'upload' | 'processing' | 'subject' | 'verify' | 'body' | 'reports';

interface Pending {
  parsed: ParsedReport;
  file: File;
  drafts: DraftMetric[];
  heightCm: number | null;
  heightEdited: boolean;
  profile: Profile | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [view, setView] = useState<View>('upload');
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [readyReportId, setReadyReportId] = useState<string | null>(null);

  const profiles = useLiveQuery(() => db.profiles.toArray(), [], [] as Profile[]);
  const reports = useLiveQuery(
    () => db.reports.orderBy('measurement_date').reverse().toArray(),
    [],
    [],
  );
  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? pending?.profile ?? profiles[0] ?? null;

  /** The body is built from the most recent verified report for the active profile. */
  const current = useLiveQuery(
    async () => {
      if (!activeProfile) return null;
      const owned = await db.reports.where('profile_id').equals(activeProfile.id).toArray();
      const latest = owned.sort((a, b) =>
        a.measurement_date.localeCompare(b.measurement_date),
      )[owned.length - 1];
      if (!latest) return null;
      return { report: latest, metrics: await db.metrics.where('report_id').equals(latest.id).toArray() };
    },
    [activeProfile?.id, readyReportId],
    null as { report: StoredReport; metrics: Metric[] } | null,
  );

  // A returning visitor with stored reports should land on their body, not on the
  // first-run upload prompt. Routes once, then leaves navigation to the user.
  const routed = useRef(false);
  useEffect(() => {
    if (routed.current || reports.length === 0) return;
    routed.current = true;
    setView((v) => (v === 'upload' ? 'body' : v));
  }, [reports.length]);

  async function handleFile(file: File) {
    setError(null);

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF reports can be read automatically right now.');
      return;
    }

    setView('processing');
    setStep(0);

    try {
      const parseTask = file.arrayBuffer().then(parsePdf);

      for (let i = 0; i < PROCESSING_STEPS.length - 1; i++) {
        await sleep(280);
        setStep(i + 1);
      }

      const parsed = await parseTask;
      if (parsed.metrics.length === 0) {
        throw new Error('No measurements were found in this file.');
      }

      const drafts: DraftMetric[] = parsed.metrics.map((m) => ({ ...m, edited_by_user: false }));
      const next: Pending = {
        parsed,
        file,
        drafts,
        heightCm: parsed.height_cm_derived,
        heightEdited: false,
        profile: null,
      };

      const match = matchProfile(parsed, profiles);
      if (match) {
        setPending({ ...next, profile: match });
        setActiveProfileId(match.id);
        setView('verify');
      } else if (profiles.length > 0) {
        setPending(next);
        setView('subject');
      } else {
        const profile = await createProfile(parsed);
        setPending({ ...next, profile });
        setActiveProfileId(profile.id);
        setView('verify');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
      setView('upload');
    }
  }

  async function confirmVerification() {
    if (!pending?.profile || !pending.heightCm) return;

    const reportId = uid();
    const date = pending.parsed.measurement_date ?? new Date().toISOString().slice(0, 10);

    const metrics: Metric[] = pending.drafts.map((d) => ({
      id: uid(),
      report_id: reportId,
      profile_id: pending.profile!.id,
      canonical_name: d.canonical_name,
      display_name: d.display_name,
      value: d.value,
      unit: d.unit,
      measurement_date: date,
      category: d.category,
      source_classification: d.source_classification,
      source_reference_range: null,
      source_page: d.source_page,
      provenance: 'measured',
      confidence: d.confidence,
      edited_by_user: d.edited_by_user,
    }));

    await commitReport({
      profile: pending.profile,
      parsed: pending.parsed,
      metrics: metrics.map((m) => ({ ...m, report_id: reportId })),
      file: pending.file,
      fileName: pending.file.name,
      heightCm: pending.heightCm,
      heightEdited: pending.heightEdited,
    });

    setReadyReportId(reportId);
    setPending(null);
    setView('body');
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-atlas-line bg-atlas-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <button
            onClick={() => setView(reports.length ? 'reports' : 'upload')}
            className="text-sm uppercase tracking-[0.2em]"
          >
            Body Atlas
          </button>

          <nav className="ml-6 flex gap-5 text-sm">
            {(['body', 'reports'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                disabled={v === 'body' && !current}
                className={`capitalize disabled:opacity-30 ${
                  view === v ? 'text-atlas-text' : 'text-atlas-muted hover:text-atlas-text'
                }`}
              >
                {v}
              </button>
            ))}
          </nav>

          {profiles.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-atlas-muted">Profile</span>
              <select
                data-testid="profile-switcher"
                value={activeProfile?.id ?? ''}
                onChange={(e) => setActiveProfileId(e.target.value)}
                className="rounded-lg border border-atlas-line bg-atlas-panel px-3 py-1.5 text-sm outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.subject_name ?? 'Unnamed'}
                    {p.age ? ` · ${p.age}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      <main>
        {view === 'upload' && <UploadScreen onFile={handleFile} error={error} />}

        {view === 'processing' && <ProcessingScreen step={step} />}

        {view === 'subject' && pending && (
          <SubjectCheckScreen
            parsed={pending.parsed}
            existing={profiles}
            onCreate={async () => {
              const profile = await createProfile(pending.parsed);
              setPending({ ...pending, profile });
              setActiveProfileId(profile.id);
              setView('verify');
            }}
            onAttach={(profile) => {
              setPending({ ...pending, profile });
              setActiveProfileId(profile.id);
              setView('verify');
            }}
            onCancel={() => {
              setPending(null);
              setView('upload');
            }}
          />
        )}

        {view === 'verify' && pending && (
          <VerifyScreen
            parsed={pending.parsed}
            drafts={pending.drafts}
            subjectName={pending.profile?.subject_name ?? pending.parsed.subject_name}
            heightCm={pending.heightCm}
            heightEdited={pending.heightEdited}
            onHeightChange={(cm) => setPending({ ...pending, heightCm: cm, heightEdited: true })}
            onChange={(index, patch) =>
              setPending({
                ...pending,
                drafts: pending.drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)),
              })
            }
            onConfirm={confirmVerification}
          />
        )}

        {view === 'body' && activeProfile && current && (
          <BodyScreen
            profile={activeProfile}
            metrics={current.metrics}
            measurementDate={current.report.measurement_date}
            narrative={current.report.narrative ?? null}
            provider={current.report.provider}
          />
        )}

        {view === 'reports' && (
          <ReportsScreen
            reports={reports}
            profiles={profiles}
            onDelete={deleteReport}
            onUpload={() => setView('upload')}
          />
        )}
      </main>
    </div>
  );
}
