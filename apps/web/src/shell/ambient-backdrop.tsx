/**
 * ambient-backdrop.tsx — the app-wide ambient glow that everything floats over.
 *
 * A fixed, non-interactive layer painted behind the shell: the base surface plus
 * two soft radial "lamplight" pools drawn from the ember accent. It is fully
 * token-driven (invariant #6) — every color is a color-mix of the semantic
 * tokens, so it re-tints automatically when data-app-theme flips warm-light ↔
 * warm-dark (the tokens switch; this component never reads a raw hex).
 *
 * Kept deliberately low-contrast so it reads as atmosphere, never competing with
 * the floating content cards or their text.
 */

export function AmbientBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 bg-surface"
      style={{
        backgroundImage: [
          // Warm pool, upper-left — the "lamp"
          'radial-gradient(58rem 58rem at 12% -6%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 60%)',
          // Fainter echo, lower-right — keeps the field from feeling one-sided
          'radial-gradient(46rem 46rem at 108% 112%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 55%)',
          // Gentle cool settle so the middle stays calm and readable
          'radial-gradient(80rem 60rem at 50% 40%, color-mix(in srgb, var(--color-surface-raised) 55%, transparent), transparent 70%)',
        ].join(', '),
      }}
    />
  );
}
