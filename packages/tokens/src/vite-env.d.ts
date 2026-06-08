// Type declarations for Vite/Vitest query suffixes used in tests.
// The `?raw` suffix imports a file as a plain string at test time (via Vitest's
// css:true option); this declaration satisfies the TypeScript compiler.

declare module '*?raw' {
  const content: string;
  export default content;
}
