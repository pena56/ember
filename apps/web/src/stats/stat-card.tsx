/**
 * stat-card.tsx — shared card wrapper for Stats tab sections.
 *
 * Matches the card aesthetic from habit-header.tsx:
 * rounded-2xl bg-surface-raised border border-line with generous padding.
 * Optional section title rendered as h2 with Inter uppercase tracking (muted).
 * Using h2 (not p) so the document outline is meaningful for AT navigation.
 * Token-only styling (invariant #6).
 */

interface StatCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function StatCard({ title, children, className = '' }: StatCardProps) {
  return (
    <div className={`rounded-2xl bg-surface-raised border border-line px-6 py-5 ${className}`}>
      {title && (
        <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-4">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
