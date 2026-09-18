import { useRef, useState } from 'react';

export function UploadScreen({ onFile, error }: { onFile: (f: File) => void; error?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-light tracking-tight">Build your body map</h1>
      <p className="mt-5 max-w-md text-atlas-muted">
        Upload a health or body-composition report and turn your measurements into an
        interactive body.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className={`mt-12 w-full rounded-2xl border border-dashed p-12 transition ${
          over ? 'border-atlas-accent bg-atlas-accent/5' : 'border-atlas-line'
        }`}
      >
        <button
          onClick={() => input.current?.click()}
          className="rounded-lg bg-atlas-accent px-6 py-3 font-medium text-atlas-bg transition hover:brightness-110"
        >
          Upload report
        </button>
        <p className="mt-4 text-sm text-atlas-muted">or drop a file here · PDF, JPG, PNG</p>
        <input
          ref={input}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <p className="mt-10 text-xs text-atlas-muted/70">
        Your reports stay on this device. Nothing is uploaded to a server.
      </p>
    </div>
  );
}
