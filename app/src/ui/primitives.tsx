import type { ReactNode } from 'react';

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  const styles = {
    primary:
      'bg-atlas-accent text-atlas-bg hover:brightness-110 font-medium disabled:opacity-40',
    ghost:
      'border border-atlas-line text-atlas-text hover:border-atlas-muted disabled:opacity-40',
    danger: 'text-red-300/80 hover:text-red-300 border border-transparent hover:border-red-400/30',
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm transition disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * Provenance is never implied — it is labelled. A reader must be able to tell a value
 * read from the report from one the app computed.
 */
export function ProvenanceTag({ level }: { level: 'measured' | 'derived' | 'illustrative' }) {
  const styles = {
    measured: 'bg-atlas-accent/10 text-atlas-accent border-atlas-accent/25',
    derived: 'bg-sky-400/10 text-sky-300 border-sky-400/25',
    illustrative: 'bg-amber-400/10 text-amber-300 border-amber-400/25',
  }[level];

  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${styles}`}>
      {level}
    </span>
  );
}

/** The provider's own word, shown verbatim and attributed. Never restyled by meaning. */
export function SourceLabel({ label }: { label: string | null }) {
  if (!label) return <span className="text-atlas-muted/50 text-xs">—</span>;
  return (
    <span className="rounded border border-atlas-line bg-atlas-panel px-2 py-0.5 text-xs text-atlas-muted">
      {label}
    </span>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-atlas-line bg-atlas-panel/60 ${className}`}>
      {children}
    </div>
  );
}
