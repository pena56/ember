# Unit 02d: Mobile theming

Issue: #24 · Branch: feat/24-mobile-theming · Boundary: `apps/mobile`
Route: standard — one boundary; theming architecture resolved in 02c; integration details are
doc-grounded. Depends on #22 (merged). Runtime verification is device-bound (see note).

## Goal
Wire uniwind + Metro into the Expo client, consume `@ember/tokens/theme.uniwind.css`, add an app
theme provider (`system | light | dark`, default system, persisted), self-host Fraunces + Inter,
and render a minimal themed mobile shell + theme control that proves token utilities + live theme
switching work. Mirrors the web shell (Unit 02b) in behaviour.

## Design
Minimal foundation shell — real screens are units 06+. Run `impeccable` on the shell for token
fidelity / a11y (RN-appropriate). Do NOT run `frontend-design` (throwaway shell). Honour
`ui-context.md`: warm-light/warm-dark only (reader themes excluded here), Fraunces wordmark, Inter
body, accent as a large-area indicator (not low-contrast small text — same a11y call as 02b).
- Shell: `Ember` wordmark (`font-serif`, `text-text`), one line of `font-sans text-text-muted`
  body, and a segmented theme control (System / Light / Dark). Surface `bg-surface`; active
  segment indicated by accent (e.g. `border-accent` + `text-text`), inactive `text-text-muted`.
- Only `@ember/tokens` utilities — no hardcoded colors (invariant #6).

## Implementation
uniwind facts are recorded in `progress-tracker.md` ("uniwind research"). Add deps just-in-time,
pinning the registry version (see Dependencies).

### Metro + CSS entry
- `metro.config.js` (new):
  ```js
  const { getDefaultConfig } = require('expo/metro-config');
  const { withUniwindConfig } = require('uniwind/metro');
  const config = getDefaultConfig(__dirname);
  module.exports = withUniwindConfig(config, {
    cssEntryFile: './global.css',
    dtsFile: './src/uniwind-types.d.ts',
  });
  ```
  `global.css` lives at the app root so Tailwind scans both `app/` and `src/` for classNames.
- `global.css` (new, at `apps/mobile/global.css`):
  ```css
  @import 'tailwindcss';
  @import 'uniwind';
  @import '@ember/tokens/theme.uniwind.css';
  ```
- If `apps/mobile` has no `babel.config.js` and the app fails to bundle, add a minimal one
  (`module.exports = { presets: ['babel-preset-expo'] }`) — needed for Expo, not uniwind. Keep
  scope tight; only add if required to bundle.

### TypeScript types for className
- The `dtsFile` (`src/uniwind-types.d.ts`) is generated when Metro starts. Run it once
  (`npx expo start --clear`, then stop) to generate the file, and **commit it** so CI `tsc`
  passes for `className` props without running Metro. `src` is already in tsconfig `include`.
- Verify `pnpm -w typecheck` is green with the committed d.ts before finishing.

### Fonts
- `useFonts` from `@expo-google-fonts/fraunces` + `@expo-google-fonts/inter` (static instances).
  Register under family names matching the token stack so uniwind's `font-serif`/`font-sans`
  resolve on RN (RN has no CSS fallback chain — fontFamily is a single name):
  ```ts
  useFonts({
    'Fraunces Variable': Fraunces_400Regular,
    'Fraunces': Fraunces_400Regular,
    'Fraunces-SemiBold': Fraunces_600SemiBold,
    'Inter': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
  });
  ```
  Gate rendering on fonts loaded (return null / splash until ready). At runtime confirm the serif
  actually applies to the wordmark; if uniwind emits a family name not in the map, adjust the keys
  to match (build-time tuning — note in the PR which name uniwind uses).

### Theme provider
- `src/theme/resolve-app-theme.ts` (pure, unit-tested): `ThemePreference = 'system' | AppThemeName`
  (`AppThemeName` from `@ember/tokens`); `coerceStoredPreference(raw: string | null):
  ThemePreference` → returns the value if it's a valid preference, else `'system'`; export
  `STORAGE_KEY = 'ember-app-theme'`.
- `src/theme/theme-provider.tsx` (RN glue, not unit-tested): persistence uses **expo-sqlite's
  KV store** (`import Storage from 'expo-sqlite/kv-store'` — AsyncStorage-compatible, SQLite-backed;
  NOT `@react-native-async-storage/async-storage`). On mount, `await Storage.getItem(STORAGE_KEY)`,
  `coerceStoredPreference`, call `Uniwind.setTheme(pref)`. Expose context `{ preference,
  setPreference }`; `setPreference` does `Storage.setItem(STORAGE_KEY, pref)` and
  `Uniwind.setTheme`. Optionally expose resolved theme via `useUniwind()`. (Reading the synchronous
  `Storage.getItemSync` at startup is fine too if it avoids a first-frame flash.)
- `src/theme/use-theme.ts`: `useTheme()` hook (throw if outside provider).

### Themed shell
- `app/_layout.tsx`: wrap the router `Stack` in `SafeAreaProvider` (already a dep) + the
  `ThemeProvider`; load fonts here and gate.
- `app/index.tsx`: replace placeholder with the themed shell + theme control using `className` on
  RN core `View`/`Text`/`Pressable` (className works on core components per uniwind docs). Drive
  the control with `useTheme()`.

### Tests
- `src/tests/resolve-app-theme.test.ts`: `coerceStoredPreference` cases — valid `'system'`,
  `'warm-light'`, `'warm-dark'` pass through; `null`/garbage → `'system'`. (Pure; runs in the
  existing node vitest env — do NOT import the provider/RN modules into tests.)
- Keep/replace the trivial `app.test.ts`.

## Dependencies
Install just-in-time with `pnpm --filter @ember/mobile add <pkg>@<version>`; pin the registry version.
- `uniwind@1.8.0`
- `@expo-google-fonts/fraunces@0.4.1`, `@expo-google-fonts/inter@0.4.2`
- `expo-font@56.0.5` (peer of the font packages; provides `useFonts`)
- `expo-sqlite@56.0.4` (provides `expo-sqlite/kv-store` for persistence; this is the project's
  chosen local store — architecture.md — so it's wanted here regardless. NOT AsyncStorage.)

## Verify when done
Automated (executor + CI):
- [ ] `pnpm -w typecheck` passes (with committed `src/uniwind-types.d.ts`)
- [ ] `pnpm -w test` passes (pure preference helper)
- [ ] `pnpm -w lint` clean
- [ ] No hardcoded colors in `apps/mobile`; only `@ember/tokens` utilities (invariant #6)

Runtime (device-bound — `npx expo start`, simulator/device; confirmed by the user):
- [ ] Shell renders themed; Fraunces wordmark + Inter body actually apply.
- [ ] Theme control switches warm-light ↔ warm-dark live; `system` follows device appearance.
- [ ] Preference persists across app reload (expo-sqlite KV store).

## Note on verification
No simulator is available in CI/this environment, so the executor delivers the code + green
typecheck/test/lint (incl. generating & committing the uniwind d.ts). The visual/runtime checks
above are done by running the app. Reader-theme switching on mobile is deferred to reader unit 05.
