const STEPS = [
  'Reading your report',
  'Finding measurements',
  'Understanding categories',
  'Checking dates',
  'Building your profile',
];

export function ProcessingScreen({ step }: { step: number }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6">
      <ul className="space-y-5">
        {STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'pending';
          return (
            <li key={label} className="flex items-center gap-4">
              <span
                className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
                  state === 'done'
                    ? 'bg-atlas-accent'
                    : state === 'active'
                      ? 'scale-150 bg-atlas-accent'
                      : 'bg-atlas-line'
                }`}
              />
              <span
                className={`text-sm transition-colors duration-500 ${
                  state === 'pending' ? 'text-atlas-muted/40' : 'text-atlas-text'
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const PROCESSING_STEPS = STEPS;
