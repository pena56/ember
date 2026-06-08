# Architecture

## Stack
Versions verified against live registries on **2026-06-08**. Pin these in unit 01; do not
substitute remembered versions.

| Layer | Technology | Version | Role |
|---|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | latest | Share TS domain/sync logic across clients |
| Language | TypeScript | 6.0.3 | End-to-end types incl. Convex |
| Mobile | Expo / React Native | SDK 56.0.9 / RN 0.85.3 | iOS + Android client |
| Mobile routing | expo-router | 56.2.9 | File-based navigation |
| Web | React + Vite (PWA) | React 19.2.7 / Vite 8.0.16 | Laptop client, full offline-first |
| Backend / sync | Convex | 1.40.0 | Sync server, file storage, scheduled fns — NOT on-device source of truth |
| Local store (mobile) | expo-sqlite | 56.0.4 | On-device source of truth |
| Local store (web) | Dexie (IndexedDB) | 4.4.3 | On-device source of truth |
| PDF (web) | pdfjs-dist | 6.0.227 | Render + text-layer extraction |
| PDF (mobile) | react-native-pdf | 7.0.4 | Render (text-layer extraction strategy TBD — see Open Questions) |
| Notifications | expo-notifications | 56.0.16 | Local scheduled + Expo push receipt |
| Server state cache | @tanstack/react-query | 5.101.0 | Optional, online reads |
| Validation | zod | 4.4.3 | Schema validation, shared |
| Styling (web) | tailwindcss + @tailwindcss/vite | 4.3.0 | Utility CSS; semantic tokens as Tailwind v4 `@theme` |
| Styling (mobile) | uniwind | 1.8.0 | Tailwind v4 bindings for RN (Metro); targets RN 0.85 / React 19 |
| Fonts | Fraunces (serif) + Inter (sans) | via @expo-google-fonts / @fontsource | App chrome typography (resolved 2026-06-08) |

## Tooling — lint/format (official configs, verified 2026-06-08)
Adopt the stack's official/recommended configs rather than hand-rolled rules. Flat config
(`eslint.config.js`) at repo root, with per-app extension. Pin in unit 01:

| Scope | Package | Version | Role |
|---|---|---|---|
| Engine | eslint | 10.4.1 | Flat config |
| Shared base | typescript-eslint | 8.60.1 | TS recommended + naming-convention + consistent rules |
| Mobile (apps/mobile) | eslint-config-expo | 56.0.4 | Official Expo/React-Native config |
| Web (apps/web) | eslint-plugin-react-hooks · eslint-plugin-jsx-a11y | 7.1.1 · 6.10.2 | React hooks + a11y |
| Backend (convex/) | @convex-dev/eslint-plugin | 2.0.0 | Official Convex rules — arg validation, query/mutation/action misuse |
| Imports | eslint-plugin-import-x · eslint-import-resolver-typescript | 4.16.2 · 4.4.5 | Ordered/grouped imports, resolve `@ember/*` (import fork; v2 incompatible with ESLint 10) |
| Filenames | eslint-plugin-unicorn | 65.0.0 | `filename-case` → kebab-case |
| Format | prettier · eslint-config-prettier | 3.8.3 · 10.1.8 | Format; turn off conflicting lint rules |

## System Boundaries
- `packages/core/` — shared TS: domain model, HLC clock, outbox, reconciler, conflict-merge
  engine, stats/streak derivation. **No platform APIs.** This is the reusable brain.
- `packages/store/` — `Repository` interface + two impls (SQLite mobile, Dexie web).
- `apps/mobile/` — Expo client (UI, reader, notifications, platform glue).
- `apps/web/` — React PWA client (UI, reader, service worker, IndexedDB glue).
- `convex/` — schema, queries/mutations, file storage, scheduled notification functions.

## Storage Model
- **On-device (SQLite / IndexedDB) is the source of truth.** Every write lands locally first.
- **Outbox queue**: every mutation is appended as an outbox entry carrying an HLC stamp; a
  reconciler pushes to Convex when online and pulls/merges remote changes.
- **Convex** holds the synced canonical copy + PDF blobs (file storage) + computed rollups; it
  is the *authority for streak/stats numbers* once data has synced, but is never required to read.
- **Sessions are an immutable event log.** All stats and streaks are *derived* from raw sessions,
  never stored as mutable aggregates — this is what makes cross-device summation correct.

## Auth & Access
- Start **anonymous-local** (local identity, fully usable offline).
- Sign-in **claims** local data into an account; claim is processed as a normal sync/merge event
  (reuses the conflict-merge engine). Account enables cross-device sync.

## Sync & Conflict Resolution
- **Ordering:** Hybrid Logical Clocks (wall-clock + logical counter + device id) on every write.
  Convex re-stamps on arrival. Underpins all last-write-wins decisions.
- **Document identity:** SHA-256 of file bytes. Identical bytes = same document (auto-merge).
  Ambiguous matches go to the **conflict-resolution UI** (merge / keep-separate).
- **Reading position:** furthest page wins *by default*; overridable globally and per-file.
  Stored as page + relative offset (0–1) within page, so it maps across viewports.
- **Annotations & tags:** union by per-item UUID; same-item edit = HLC last-write-wins.
- **Sessions/stats:** additive — summed across devices; streaks recompute from the union.

## Invariants
1. On-device store is the source of truth; the app must fully function (read, highlight,
   capture progress) with zero network. Convex is never on the read path.
2. Every syncable mutation is written through the outbox with an HLC stamp — no direct
   writes to Convex from UI code.
3. Sessions are append-only and immutable; stats/streaks are always derived, never stored as
   the authoritative aggregate.
4. A reading session's "day" is the user's **local** calendar date stamped at capture time
   (with tz offset), never recomputed in UTC.
5. All cross-device merges go through the single shared conflict-merge engine in
   `packages/core/` — clients never invent their own merge logic.
6. Design tokens are defined once (semantic tokens) and consumed by both clients; no
   hardcoded colors/spacing in components.
7. A given (notification-type, local-day) fires on at most one device — enforced by
   primary-device election + server delivery ledger.

## Deployment (resolved 2026-06-08)
Trunk-based; production is gated behind a release tag `vX.Y.Z` (never auto-deployed from `main`).
Targets, not long-lived branches. CI scaffolds the steps; each needs a repo secret before it runs.

| Deployable | PR → preview | `main` → staging | tag `v*` → production | Secret(s) |
|---|---|---|---|---|
| Web PWA (`apps/web`) | Cloudflare Pages preview URL | CF Pages staging project | CF Pages prod project | `CLOUDFLARE_API_TOKEN`, `CF_ACCOUNT_ID` |
| Convex (`convex/`) | — | `convex deploy` → staging deployment | `convex deploy` → production | `CONVEX_DEPLOY_KEY_STAGING`, `CONVEX_DEPLOY_KEY_PROD` |
| Mobile (`apps/mobile`) | — | `eas update --channel preview` (OTA, JS-only) | `eas update --channel production` | `EXPO_TOKEN` |

Deferred: native EAS Build + store submission (needs Apple Developer + Google Play accounts);
add `eas build`/`eas submit` on tag once those exist. OTA updates require at least one installed
dev/internal build to land on.
