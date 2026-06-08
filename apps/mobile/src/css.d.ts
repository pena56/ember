// Ambient declaration so side-effect CSS imports (uniwind's `global.css`) typecheck.
// expo-env.d.ts also provides this, but it is gitignored/regenerated and absent in CI.
declare module '*.css';
