import { useMemo, useState } from 'react';
import { BUILD_COPY as C } from './buildCopy';
import { DEFAULT_SKIN_TONE, SKIN_TONES } from '../lib/bodyMaterials';
import { RANGES, deurenbergBodyFat, detailLevel, type BuildAnswers, type Sex } from '../lib/selfReport';
import { Panel } from './primitives';

type Draft = {
  name: string;
  sex: Sex;
  age: string;
  height_cm: string;
  weight_kg: string;
  fat_percentage: string;
  waist_cm: string;
  hip_cm: string;
  chest_cm: string;
  left_upper_arm_cm: string;
  right_upper_arm_cm: string;
  left_thigh_cm: string;
  right_thigh_cm: string;
  skin_tone: string;
};

const str = (n: number | undefined) => (n == null ? '' : String(n));

function fromAnswers(a?: BuildAnswers): Draft {
  return {
    name: a?.name ?? '',
    sex: a?.sex ?? 'female',
    age: str(a?.age),
    height_cm: str(a?.height_cm),
    weight_kg: str(a?.weight_kg),
    fat_percentage: str(a?.fat_percentage),
    waist_cm: str(a?.waist_cm),
    hip_cm: str(a?.hip_cm),
    chest_cm: str(a?.chest_cm),
    left_upper_arm_cm: str(a?.left_upper_arm_cm),
    right_upper_arm_cm: str(a?.right_upper_arm_cm),
    left_thigh_cm: str(a?.left_thigh_cm),
    right_thigh_cm: str(a?.right_thigh_cm),
    skin_tone: a?.skin_tone ?? DEFAULT_SKIN_TONE,
  };
}

const num = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

const inRange = (n: number | undefined, [lo, hi]: readonly [number, number]) => n != null && n >= lo && n <= hi;

function toAnswers(d: Draft): { answers: BuildAnswers | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const age = num(d.age), height = num(d.height_cm), weight = num(d.weight_kg);
  if (!d.name.trim()) errors.name = C.validation.name;
  if (!inRange(age, RANGES.age)) errors.age = C.validation.age;
  if (!inRange(height, RANGES.height_cm)) errors.height_cm = C.validation.height;
  if (!inRange(weight, RANGES.weight_kg)) errors.weight_kg = C.validation.weight;

  const optional = (key: keyof Draft, range: readonly [number, number], msg: string) => {
    const v = num(d[key] as string);
    if (d[key] && v === undefined) errors[key] = msg;
    else if (v != null && !inRange(v, range)) errors[key] = msg;
    return v;
  };
  const fat = optional('fat_percentage', RANGES.fat_percentage, C.validation.fat);
  const tape = (k: keyof Draft) => optional(k, RANGES.circumference_cm, C.validation.tape);
  const waist = tape('waist_cm'), hip = tape('hip_cm'), chest = tape('chest_cm');
  const la = tape('left_upper_arm_cm'), ra = tape('right_upper_arm_cm'), lt = tape('left_thigh_cm'), rt = tape('right_thigh_cm');

  if (Object.keys(errors).length) return { answers: null, errors };
  return {
    errors,
    answers: {
      name: d.name.trim(),
      sex: d.sex,
      age: age!,
      height_cm: height!,
      weight_kg: weight!,
      fat_percentage: fat,
      waist_cm: waist,
      hip_cm: hip,
      chest_cm: chest,
      left_upper_arm_cm: la,
      right_upper_arm_cm: ra,
      left_thigh_cm: lt,
      right_thigh_cm: rt,
      skin_tone: d.skin_tone,
    },
  };
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  inputMode = 'decimal',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  inputMode?: 'decimal' | 'text';
}) {
  return (
    <label className="block text-sm">
      <span className="text-atlas-muted">{label}</span>
      <input
        data-testid={`build-${id}`}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        className={`mt-1 w-full rounded-lg border bg-atlas-bg px-3 py-2 outline-none focus:border-atlas-accent ${
          error ? 'border-rose-400/60' : 'border-atlas-line'
        }`}
      />
      {error ? (
        <span className="mt-1 block text-xs text-rose-300">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-atlas-muted/70">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * Three levels, each revealed on request. Level 1 is enough for a body; every level
 * after it replaces an estimate or a template choice with something the person knows.
 */
export function BuildScreen({
  initial,
  onSubmit,
  onUpload,
}: {
  initial?: BuildAnswers;
  onSubmit: (answers: BuildAnswers) => void;
  onUpload: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromAnswers(initial));
  const [open, setOpen] = useState<number>(initial ? detailLevel(initial) : 1);
  const [tried, setTried] = useState(false);
  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const { answers, errors } = useMemo(() => toAnswers(draft), [draft]);
  const show = (k: string) => (tried ? errors[k] : undefined);

  const preview = useMemo(() => {
    const h = num(draft.height_cm), w = num(draft.weight_kg), a = num(draft.age);
    if (!h || !w || !a) return null;
    const bmi = w / (h / 100) ** 2;
    return { bmi, fat: deurenbergBodyFat(bmi, a, draft.sex) };
  }, [draft.height_cm, draft.weight_kg, draft.age, draft.sex]);

  const typed = ['weight', draft.fat_percentage && 'body fat', draft.waist_cm && 'waist', draft.hip_cm && 'hips', draft.chest_cm && 'chest',
    (draft.left_upper_arm_cm || draft.right_upper_arm_cm) && 'upper arms', (draft.left_thigh_cm || draft.right_thigh_cm) && 'thighs'].filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-4xl font-light tracking-tight">{C.title}</h1>
      <p className="mt-3 text-atlas-muted">{C.intro}</p>

      <Panel data-testid="build-level-1" className="mt-8 space-y-4 p-6">
        <div>
          <h2 className="text-lg">{C.level1.heading}</h2>
          <p className="mt-1 text-xs text-atlas-muted">{C.level1.note}</p>
        </div>
        <Field id="name" inputMode="text" label={C.level1.name} value={draft.name} onChange={set('name')} error={show('name')} hint={C.level1.namePlaceholder} />
        <div>
          <span className="text-sm text-atlas-muted">{C.level1.sex}</span>
          <div className="mt-1 flex gap-2" role="radiogroup" aria-label={C.level1.sex}>
            {C.level1.sexOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={draft.sex === o.value}
                data-testid={`build-sex-${o.value}`}
                onClick={() => setDraft((d) => ({ ...d, sex: o.value }))}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  draft.sex === o.value ? 'border-atlas-accent text-atlas-text' : 'border-atlas-line text-atlas-muted hover:text-atlas-text'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {draft.sex === 'other' && <p className="mt-1 text-xs text-atlas-muted/70">{C.level1.sexOtherNote}</p>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field id="age" label={C.level1.age} value={draft.age} onChange={set('age')} error={show('age')} />
          <Field id="height" label={C.level1.height} value={draft.height_cm} onChange={set('height_cm')} error={show('height_cm')} />
          <Field id="weight" label={C.level1.weight} value={draft.weight_kg} onChange={set('weight_kg')} error={show('weight_kg')} />
        </div>
        <div>
          <span className="text-sm text-atlas-muted">{C.level1.skinTone}</span>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label={C.level1.skinTone}>
            {SKIN_TONES.map((tone, i) => (
              <button
                key={tone}
                type="button"
                role="radio"
                aria-checked={draft.skin_tone === tone}
                aria-label={`Skin tone ${i + 1}`}
                data-testid={`build-tone-${i + 1}`}
                onClick={() => setDraft((d) => ({ ...d, skin_tone: tone }))}
                className={`h-8 w-8 rounded-full border-2 ${draft.skin_tone === tone ? 'border-atlas-accent' : 'border-transparent'}`}
                style={{ background: tone }}
              />
            ))}
          </div>
        </div>
      </Panel>

      {open >= 2 ? (
        <Panel data-testid="build-level-2" className="mt-4 space-y-4 p-6">
          <div>
            <h2 className="text-lg">{C.level2.heading}</h2>
            <p className="mt-1 text-xs text-atlas-muted">{C.level2.note}</p>
          </div>
          <Field
            id="fat"
            label={C.level2.fat}
            value={draft.fat_percentage}
            onChange={set('fat_percentage')}
            error={show('fat_percentage')}
            hint={preview && !draft.fat_percentage ? `${C.level2.fatEmpty} Currently ${preview.fat.toFixed(1)} % by ${'Deurenberg (1991)'}.` : C.level2.fatEmpty}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field id="waist" label={C.level2.waist} value={draft.waist_cm} onChange={set('waist_cm')} error={show('waist_cm')} />
            <Field id="hip" label={C.level2.hip} value={draft.hip_cm} onChange={set('hip_cm')} error={show('hip_cm')} />
          </div>
          <p className="text-xs text-atlas-muted/70">{C.level2.tapeNote}</p>
        </Panel>
      ) : (
        <button data-testid="build-open-2" onClick={() => setOpen(2)} className="mt-4 text-sm text-atlas-accent hover:underline">
          {C.addDetail} →
        </button>
      )}

      {open >= 3 ? (
        <Panel data-testid="build-level-3" className="mt-4 space-y-4 p-6">
          <div>
            <h2 className="text-lg">{C.level3.heading}</h2>
            <p className="mt-1 text-xs text-atlas-muted">{C.level3.note}</p>
          </div>
          <Field id="chest" label={C.level3.chest} value={draft.chest_cm} onChange={set('chest_cm')} error={show('chest_cm')} />
          <div className="grid grid-cols-2 gap-3">
            <Field id="left-arm" label={C.level3.leftArm} value={draft.left_upper_arm_cm} onChange={set('left_upper_arm_cm')} error={show('left_upper_arm_cm')} />
            <Field id="right-arm" label={C.level3.rightArm} value={draft.right_upper_arm_cm} onChange={set('right_upper_arm_cm')} error={show('right_upper_arm_cm')} />
            <Field id="left-thigh" label={C.level3.leftThigh} value={draft.left_thigh_cm} onChange={set('left_thigh_cm')} error={show('left_thigh_cm')} />
            <Field id="right-thigh" label={C.level3.rightThigh} value={draft.right_thigh_cm} onChange={set('right_thigh_cm')} error={show('right_thigh_cm')} />
          </div>
          <div className="border-t border-atlas-line pt-4 text-sm">
            <button data-testid="build-upload" onClick={onUpload} className="text-atlas-accent hover:underline">
              {C.level3.upload}
            </button>
            <p className="mt-1 text-xs text-atlas-muted/70">{C.level3.uploadNote}</p>
          </div>
        </Panel>
      ) : (
        open >= 2 && (
          <button data-testid="build-open-3" onClick={() => setOpen(3)} className="mt-4 text-sm text-atlas-accent hover:underline">
            {C.addDetail} →
          </button>
        )
      )}

      <div data-testid="build-summary" className="mt-8 text-xs leading-relaxed text-atlas-muted">
        <div>
          {C.summary.typed}
          {typed.join(', ')}.
        </div>
        {!draft.fat_percentage && (
          <div>
            {C.summary.estimated}body fat{preview ? ` (${preview.fat.toFixed(1)} %)` : ''}.
          </div>
        )}
        <div>{C.summary.derived}BMI, fat mass, lean mass.</div>
      </div>

      <button
        data-testid="build-submit"
        onClick={() => {
          setTried(true);
          if (answers) onSubmit(answers);
        }}
        className="mt-6 rounded-lg bg-atlas-accent px-6 py-3 font-medium text-atlas-bg transition hover:brightness-110"
      >
        {C.submit}
      </button>
      {tried && !answers && (
        <p className="mt-3 text-xs text-rose-300">Some answers need a look — they are marked above.</p>
      )}
    </div>
  );
}
