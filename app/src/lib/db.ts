import Dexie, { type EntityTable } from 'dexie';
import type { Category, Provenance } from './catalog';
import type { ParsedReport, ReportNarrative } from './parser';
import type { BuildAnswers } from './selfReport';

export interface Profile {
  id: string;
  subject_name: string | null;
  age: number | null;
  sex: string | null;
  height_cm: number | null;
  height_provenance: Provenance;
  created_at: string;
  /** Chosen for the picture only; sRGB hex. Optional and unindexed, so no schema version. */
  skin_tone?: string;
}

export interface Report {
  id: string;
  profile_id: string;
  provider: string;
  report_type: 'body_composition' | 'self_report';
  measurement_date: string;
  uploaded_at: string;
  /** Absent for a self-report: there is no document, only answers. */
  original_file?: Blob;
  file_name?: string;
  /** The questionnaire as answered, so it can be edited later. */
  answers?: BuildAnswers;
  extraction_status: 'parsed' | 'verified';
  metric_count: number;
  /** The report's own prose, kept so Data Check can compare it against the tables. */
  narrative: ReportNarrative;
}

export interface Metric {
  id: string;
  report_id: string;
  profile_id: string;
  canonical_name: string;
  display_name: string;
  value: number | string;
  unit: string | null;
  measurement_date: string;
  category: Category;
  source_classification: string | null;
  source_reference_range: string | null;
  source_page: number | null;
  provenance: Provenance;
  confidence: 'high' | 'low';
  edited_by_user: boolean;
}

class BodyAtlasDb extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  reports!: EntityTable<Report, 'id'>;
  metrics!: EntityTable<Metric, 'id'>;

  constructor() {
    super('body-atlas');
    this.version(1).stores({
      profiles: 'id, subject_name, created_at',
      reports: 'id, profile_id, measurement_date, uploaded_at',
      metrics: 'id, report_id, profile_id, canonical_name, [profile_id+canonical_name]',
      snapshots: 'id, report_id, profile_id, measurement_date',
    });
    // The body is a pure function of a report's metrics, so a stored snapshot was only
    // ever a cache nothing read. Dropped; existing databases upgrade in place.
    this.version(2).stores({ snapshots: null });
  }
}

export const db = new BodyAtlasDb();

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * The app cannot know whose report a file is. It compares the header against known
 * profiles and lets the user decide — it never merges two subjects silently, because a
 * timeline mixing two people would be a false record.
 */
export function matchProfile(parsed: ParsedReport, profiles: Profile[]): Profile | null {
  const name = parsed.subject_name?.trim().toLowerCase();
  if (!name) return null;

  return (
    profiles.find(
      (p) =>
        p.subject_name?.trim().toLowerCase() === name &&
        (parsed.sex == null || p.sex == null || p.sex === parsed.sex),
    ) ?? null
  );
}

export async function createProfile(parsed: ParsedReport, extra: Partial<Profile> = {}): Promise<Profile> {
  const profile: Profile = {
    id: uid(),
    subject_name: parsed.subject_name,
    age: parsed.age,
    sex: parsed.sex,
    height_cm: parsed.height_cm_derived,
    height_provenance: 'derived',
    created_at: new Date().toISOString(),
    ...extra,
  };
  await db.profiles.add(profile);
  return profile;
}

export interface CommitInput {
  profile: Profile;
  parsed: ParsedReport;
  metrics: Metric[];
  /** The document, when there is one. A self-report has answers instead. */
  file?: Blob;
  fileName?: string;
  answers?: BuildAnswers;
  heightCm: number;
  heightProvenance: Provenance;
  /** Extra profile fields to store alongside the height, e.g. a chosen skin tone. */
  profilePatch?: Partial<Profile>;
}

export async function commitReport(input: CommitInput): Promise<Report> {
  const { profile, parsed, metrics, file, fileName, answers, heightCm, heightProvenance, profilePatch } = input;
  const id = metrics[0]?.report_id ?? uid();

  const report: Report = {
    id,
    profile_id: profile.id,
    provider: parsed.provider,
    report_type: answers ? 'self_report' : 'body_composition',
    measurement_date: parsed.measurement_date ?? new Date().toISOString().slice(0, 10),
    uploaded_at: new Date().toISOString(),
    ...(file ? { original_file: file, file_name: fileName } : {}),
    ...(answers ? { answers } : {}),
    extraction_status: 'verified',
    metric_count: metrics.length,
    narrative: parsed.narrative,
  };

  await db.transaction('rw', db.reports, db.metrics, db.profiles, async () => {
    // Re-committing the same id (an edited questionnaire) replaces its rows outright.
    await db.metrics.where('report_id').equals(id).delete();
    await db.reports.put(report);
    await db.metrics.bulkPut(metrics);
    await db.profiles.update(profile.id, {
      height_cm: heightCm,
      height_provenance: heightProvenance,
      ...profilePatch,
    });
  });

  return report;
}

export async function deleteReport(reportId: string) {
  await db.transaction('rw', db.reports, db.metrics, async () => {
    await db.metrics.where('report_id').equals(reportId).delete();
    await db.reports.delete(reportId);
  });
}

export async function deleteProfile(profileId: string) {
  await db.transaction('rw', db.profiles, db.reports, db.metrics, async () => {
    await db.metrics.where('profile_id').equals(profileId).delete();
    await db.reports.where('profile_id').equals(profileId).delete();
    await db.profiles.delete(profileId);
  });
}
