# Build Plan — Ember

Ordered tracer-bullet units. Dependencies first → security before the features it gates →
backend/sync before frontend wiring → UI shells before real data → local-first before remote.
Each unit leaves the app runnable. Run `spec-unit` on the next unit before coding it.

> Decompose into tracker issues with `to-issues` when a repo/issue tracker exists; for now this
> file is the source of truth for ordering.

| # | Unit | Why here / depends on |
|---|---|---|
| 01 | **Monorepo + tooling scaffold** — pnpm workspaces + Turbo, TS strict base config, ESLint flat config built on the **official configs** (`typescript-eslint` base, `eslint-config-expo` for mobile, react-hooks+jsx-a11y for web) wiring the kebab-case/import-order/naming-convention rules from `code-standards.md`, Prettier, empty `packages/core`, `packages/store`, `packages/tokens`, `apps/mobile` (Expo) + `apps/web` (Vite PWA) shells, `convex/` init. Pin lint/format + runtime versions from architecture.md (Tooling + Stack). | Foundation; nothing works without it. |
| 02 | **Design tokens + theming** — semantic tokens, warm-light/warm-dark/sepia, serif+sans fonts, theme provider on both clients. App chrome renders themed. | UI shell before data; unblocks all screens. |
| 03 | **Local store + HLC + outbox** — `Repository` interface + SQLite (mobile) & Dexie (web) impls; HLC clock; append-only outbox primitives. Pure-core tests. | Offline source of truth; everything persists here. |
| 04 | **Import + document identity + Library list** — add a local PDF, SHA-256 hash, store metadata, flat Library list (no sync yet). | First real data; needs 03. |
| 05 | **PDF reader (scroll + paged) + text-layer extraction** — render on both clients; continuous scroll default. | Core reading; needs 04. |
| 06 | **Reading position + resume** — page+offset capture, Today "Continue Reading" card. | Needs 05; first Today surface. |
| 07 | **Session/idle tracking engine** — active-time + page events → immutable session log (local-day stamped). | Needs 05/06; foundation for habit features. |
| 08 | **Streaks + daily goal + freezes** — derived from sessions; Today goal ring + ember. | Needs 07; the differentiator begins. |
| 09 | **Rich analytics rollups** — Stats tab: heatmap, time/pages, speed, time-of-day, ETA. Derived from session log. | Needs 07/08. |
| 10 | **Highlights + notes** — text-anchored + pixel-rect fallback; UUID-keyed annotations. | Needs 05; another syncable type. |
| 11 | **Auth: anonymous-local → account claim** | Security before the sync/file features it gates. |
| 12 | **Convex schema + sync server + reconciler** — push/pull, HLC ordering, outbox drain, merge engine (position/annotation/tag/session rules). | Needs 03/10/11; the hard core. |
| 13 | **File storage sync + quota** — upload/download PDFs to Convex storage, per-file cap + per-user quota, over-limit UX, encrypted at rest. | Needs 12. |
| 14 | **Conflict-resolution UI + claim merge** — merge/keep-separate for ambiguous docs; account-claim as a merge event; per-file conflict policy. | Needs 12; reuses merge engine. |
| 15 | **Tags + smart views** — Library organization; union merge. | Needs 12 for cross-device. |
| 16 | **Notification engine** — local scheduled (expo-notifications) + Convex scheduled push; primary-device election + delivery ledger; learned best-time + streak-risk; suppress if already read. | Needs 07/08/11/12. |
| 17 | **Settings** — sync conflict policy (global/per-file), reading themes, notification prefs, quota view. | Ties together 13/14/16. |

## Notes
- v1 = "build it all" (learning project, no launch pressure), but build in this order so there's
  always a runnable, debuggable baseline.
- Deferred (not in this plan): E2E file encryption, OCR, gamification beyond streaks, folders.
