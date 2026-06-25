// Minimal ImportMeta augmentation for import.meta.glob used in convex-test harness.
// Vitest transforms import.meta.glob at build time; this stub satisfies tsc.
interface ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}
