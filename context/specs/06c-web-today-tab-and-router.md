# Unit 06c: Web Today tab + Continue Reading card + react-router tab shell

Issue: #56 (part of umbrella Unit 06) · Branch: feat/56-web-today-tab-and-router · Boundary: apps/web
Route: standard — single boundary (apps/web), ambiguity resolved below. Adds one dep (react-router) and a
net-new visual surface (Today + app shell), so **frontend-design generates the new UI + impeccable audits it
(token-driven) before the fresh-context Opus review** — see Routing note.

Third slice of Unit 06: **06a** core+store model (#52, MERGED) → **06b** web reader capture/restore (#54,
MERGED) → **06c** web Today tab + Continue Reading card + tab-nav shell (this) → **06d** mobile reader resume
+ native Today (device-bound, deferred).

## Goal
Give the web app a real navigation shell and a habit-forward home. Introduce **react-router** with
URL-addressable tabs (`/today`, `/library`, `/read/:docId`); migrate the existing state-based nav
(`openDocId` in `App.tsx`) onto routes. **Today** shows a greeting + a **Continue Reading** card driven by
06a/06b reading positions (resume the most-recently-read document). No streak ember, no goal ring (both need
the session log, which doesn't exist yet), no per-book percentage (no page count is persisted yet).

## Design decisions (confirmed with user, 2026-06-11)
- **Today = Continue Reading only.** Omit the streak ember + today's goal ring entirely until the session log
  exists — no placeholder/dead UI, no fake numbers (honors the "quiet, no guilt-trip" voice). They arrive in
  the unit that introduces sessions.
- **Tab nav = react-router** (URL routing, browser back/forward, refresh-stays-on-tab, deep links) — chosen
  over extending the `openDocId` state switch. Per ui-context, web uses a sidebar/top nav (not a bottom bar).
- **No "% through" on the card.** `Document` carries no page count; `ReadingPosition` has page + within-page
  offset but no total. The card shows **"Page N"** only; a percentage waits for a persisted page-count
  (later metadata unit).

## Dependencies
- **react-router `7.17.0`** (peers `react >=18`, `react-dom >=18` — compatible with web React 19.2.7). v7 is the
  unified package: import `BrowserRouter`, `MemoryRouter`, `Routes`, `Route`, `Outlet`, `NavLink`, `Navigate`,
  `useNavigate`, `useParams` from **`react-router`** (do NOT add `react-router-dom`). Add to `apps/web`
  `dependencies` exactly as `"react-router": "7.17.0"` (pin, no caret — matches the project's pinning
  discipline). Run the install from the repo root so the workspace lockfile updates.

## Implementation

### `apps/web/src/store/web-store.ts` (extend)
Expose the one store method 06b deferred — mirror the existing `getReadingPosition` wiring:
- Add to the `WebStore` interface + factory:
  `listReadingPositions(): Promise<ReadingPosition[]>` → delegates to `@ember/store`'s
  `listReadingPositions(repo)` (already exported from 06a). No sorting/joining here — that's a UI concern
  (see the selector below). `ReadingPosition` type already imported.

### `apps/web/src/today/select-continue-reading.ts` (new — pure, no DOM/React)
Headless selector so the join/sort logic is unit-tested without rendering:
- `export interface ContinueReadingItem { docId: string; title: string; page: number; updatedAt: string }`
- `export function selectContinueReading(positions: ReadingPosition[], documents: Document[]): ContinueReadingItem[]`
  - Join each position to its document by `position.id === document.id` (06a: the position's `id` **is** the
    docId). **Drop positions with no matching document** (a deleted/missing doc must not crash Today).
  - Sort **most-recently-read first** by `updatedAt` descending (encoded HLC string-sorts in agreement with
    recency — the `encode` invariant from 06a). Stable for equal stamps.
  - Map to `{ docId: position.id, title: document.title, page: position.page, updatedAt: position.updatedAt }`.
  - Return the full sorted list; the card consumer takes `[0]`. (Returning the list keeps the selector
    reusable for a future "Currently reading" view without rework.)
- `Document` / `ReadingPosition` types from `@ember/core`.

### `apps/web/src/today/use-continue-reading.ts` (new hook)
- `useContinueReading(): { items: ContinueReadingItem[]; loading: boolean }` — store from `useWebStore()`.
- On mount, `Promise.all([store.listReadingPositions(), store.listDocuments()])`, run `selectContinueReading`,
  set state. Mirror `use-library.ts`'s cancel-flag + `loading` pattern. **Swallow read errors** (set empty,
  not throw) — Today must render offline even if a read fails (invariant #1; Convex never on the read path).

### `apps/web/src/today/continue-reading-card.tsx` (new — net-new UI)
- Renders the latest `ContinueReadingItem`: document **title** (Fraunces) + a quiet "Page {n}" line (Inter,
  text-muted) + a primary **Resume** affordance. Card surface = `bg-surface-raised border border-line`,
  rounded, cozy spacing — token-driven (invariant #6, no hardcoded palette). Build on shadcn primitives
  (Card/Button) per ui-context's web component decision; handroll only the brand-specific bits.
- Resume action calls an injected `onResume(docId)` (the Today page wires it to `navigate('/read/' + docId)`).
- **Empty state** (no items): a gentle nudge in the brand voice (e.g. "Nothing open yet — pick a book from
  your library to begin."), with a link/button to `/library`. No guilt-tripping.

### `apps/web/src/today/today-page.tsx` (new — net-new UI)
- A time-of-day **greeting** (e.g. "Good morning/afternoon/evening" — derive from local hour; keep copy quiet
  and literary) + the `ContinueReadingCard`. Same `max-w-2xl` centered column + spacing as LibraryPage's main
  content so the two tabs feel like one app. Uses `useContinueReading()`; shows a small loading state while
  the read resolves (reuse the existing spinner pattern).

### `apps/web/src/app-shell.tsx` (new — net-new UI; shared layout)
- The app chrome shared by Today + Library (NOT the reader). Renders a **sticky top-nav header**:
  - **Ember** wordmark (Fraunces) on the left (moved here from `LibraryPage`'s header).
  - Center/left tabs: **Today** (`/today`) and **Library** (`/library`) as `NavLink`s with an active style
    that matches the existing segmented-control idiom (accent underline on active; `aria-current` handled by
    `NavLink`). Keyboard-focusable, visible focus ring (reuse the `focus-visible:outline-accent` pattern).
  - **ThemeControl** on the right (moved here from `LibraryPage` so it's app-wide — extract the existing
    `ThemeControl` from `library-page.tsx` into a small shared component, e.g. `apps/web/src/theme/theme-control.tsx`,
    and import it in both the shell and any test that needs it; behavior unchanged).
- Body renders `<Outlet/>`. Mark up as `<header>` + `<nav aria-label="Primary">` + `<main>` for a11y.

### `apps/web/src/library/library-page.tsx` (trim)
- **Remove** the page's own `<header>` (Ember wordmark + ThemeControl) — the shell now provides app chrome.
- Keep everything below it: the "Library" page title + count, the `ImportDropzone`, the document list / empty
  state. `onOpen` stays a prop (the Library route passes `navigate('/read/' + id)`).
- Move the `ThemeControl` component out to `theme/theme-control.tsx` (shared) and delete the local copy.

### `apps/web/src/App.tsx` (rewrite to routes)
- Replace the `openDocId` state switch with `<Routes>`:
  - `<Route element={<AppShell/>}>` → `<Route index element={<Navigate to="/today" replace/>}/>`,
    `<Route path="today" element={<TodayPage/>}/>`, `<Route path="library" element={<LibraryRoute/>}/>`.
  - `<Route path="read/:docId" element={<ReaderRoute/>}/>` (outside the shell — full-screen reader).
  - A catch-all `<Route path="*" element={<Navigate to="/today" replace/>}/>`.
- `LibraryRoute`: thin wrapper rendering `<LibraryPage onOpen={(id) => navigate('/read/' + id)}/>`.
- `ReaderRoute`: reads `docId` from `useParams`; resolves the title (best-effort via `store.listDocuments`,
  exactly as the old `ConnectedReader` did); renders
  `<ReaderPage key={docId} docId={docId} title={title || docId} onClose={() => navigate(-1)}/>`. Keep
  `key={docId}` (router does not remount on param change — preserves 06b's resume-once guard). If `docId` is
  missing/empty, `<Navigate to="/library" replace/>`.
- `App` renders only `<Routes>` + the `<Toaster/>`; it must **not** contain the Router itself (see main.tsx)
  so tests can supply `MemoryRouter`.

### `apps/web/src/main.tsx` (wrap)
- Wrap `<App/>` in `<BrowserRouter>` (inside the existing `ThemeProvider`/`StoreProvider`). Provider order:
  `ThemeProvider > StoreProvider > BrowserRouter > App`.

### Tests
- `apps/web/src/today/select-continue-reading.test.ts` (pure): joins position→document by id; **drops**
  positions whose document is missing; sorts most-recent (`updatedAt` desc) first; empty inputs → `[]`;
  maps fields correctly (`docId`/`title`/`page`).
- `apps/web/src/tests/app-shell.test.tsx` (jsdom + `MemoryRouter`, MemoryRepository store, mock sonner):
  (1) `/` redirects to `/today` (greeting visible); (2) clicking the **Library** tab navigates to the Library
  (dropzone/empty-state visible) and **Today** tab navigates back; (3) the ThemeControl renders in the shell
  with the `aria-pressed` pattern (the assertion moved out of `library-page.test`).
- `apps/web/src/tests/today-continue-reading.test.tsx` (jsdom + `MemoryRouter`, pdf.js mocked like
  `app-navigation.test.tsx`): with a saved position + matching document, Today shows the **Continue Reading**
  card (title + "Page N"); clicking **Resume** navigates to `/read/:docId` (reader toolbar visible). With no
  positions, Today shows the empty/nudge state and a link to the Library.
- `apps/web/src/tests/web-store-reading-position.test.ts` (extend): `listReadingPositions` returns all saved
  positions across distinct docs (thin wrapper over already-tested 06a).
- **Update existing tests for the router migration** (expected churn, not new behavior):
  - `app-navigation.test.tsx`: wrap `<App/>` in `<MemoryRouter initialEntries={['/library']}>`; the open→back
    flow now goes Library → `/read/:docId` → back to Library (assert via the route/title as before).
  - `library-page.test.tsx`: drop the "preserves the theme control" test (now covered by `app-shell.test`);
    other tests render `LibraryPage` in isolation and stay green (no header dependency).
  - `reader-restore.test.tsx` renders `ReaderPage` directly — unaffected.

## Verify when done
- [ ] `/` redirects to `/today`; Today and Library are reachable via the top-nav tabs with active styling;
      `/read/:docId` opens the reader full-screen and back returns to the previous tab.
- [ ] Today's **Continue Reading** card shows the most-recently-read document (title + "Page N") and **Resume**
      opens it at the saved position (06b resume path, exercised end-to-end). No positions → quiet nudge to the
      Library. No streak ember, no goal ring, no percentage.
- [ ] `listReadingPositions` exposed on the web-store; `selectContinueReading` drops orphaned positions and
      sorts by recency. A failed read never blanks/crashes the app (invariant #1, offline).
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes · `pnpm -w lint` clean.
- [ ] No invariant violated — #1 (works offline, Convex never on the read path), #6 (token-driven, no
      hardcoded palette in the new UI). `mergeReadingPosition` stays unused (reconcile is unit 12).
      **packages/core + packages/store stay byte-identical** (apps/web-only change).

## Routing note
Net-new visual surface — the **Today page, the Continue Reading card, and the app-shell top-nav** are new UI.
So design quality is part of "done": **generate the new UI with `frontend-design`** (distinctive,
production-grade, building on shadcn primitives per ui-context), then **audit with `impeccable`** for
UX/visual/a11y — both must honor `ui-context.md` tokens (Amber Ember palette, Fraunces/Inter, cozy spacing,
warm encouraging voice; a missed/empty state is gentle, never guilt-tripping). Run these in the executor step,
before the fresh-context **Opus** review (which checks the unit against `architecture.md` invariants).
Browser-verify (user, before merge): load app → lands on Today; with a previously-read book, the Continue
Reading card resumes to the saved page on Resume; switch tabs (Today↔Library) and refresh — the URL/tab
persists; open a book, press back → returns to the tab you came from; a never-read library → Today shows the
nudge.
