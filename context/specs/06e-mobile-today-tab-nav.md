# Unit 06e: Mobile native Today + bottom tab nav

Issue: #60 (part of umbrella Unit 06) · Branch: feat/60-mobile-today-tab-nav · Boundary: apps/mobile
Route: standard — single boundary (apps/mobile), no new dep (expo-router already the mobile router),
product fully resolved (mirrors 06c). **Net-new UI** (Today screen, Continue Reading card, bottom tab
bar) → **frontend-design generates the new UI + impeccable audits it (token-driven) before the
fresh-context Opus review.** Device-bound, like 02d/03c/05b/06d.

Final slice of Unit 06 and the mobile mirror of **06c**: **06a** core+store model (#52) → **06b** web
reader capture/restore (#54) → **06c** web Today + react-router shell (#56) → **06d** mobile reader
capture/restore (#58) → **06e** mobile native Today + bottom tab nav (this). Completes umbrella Unit 06.

## Goal
Give `apps/mobile` a real navigation shell and a habit-forward home: an **expo-router bottom tab bar**
with **Today** + **Library** tabs, and a native **Today** screen whose **Continue Reading** card resumes
the most-recently-read document (driven by 06a/06d reading positions). The reader stays a full-screen
stack route outside the tabs.

## Design decisions (resolved — carry over from 06c, 2026-06-11; mobile specifics this unit)
- **Today = Continue Reading only.** No streak ember, no goal ring, no per-book percentage — all need the
  session log (later unit) or a persisted page count (later metadata unit). No placeholder/dead UI, no
  fake numbers (honors the quiet, no-guilt voice). Mirrors 06c exactly.
- **Tab nav = expo-router `Tabs` (bottom bar).** Per ui-context, mobile uses a **bottom tab bar** (web used
  a top nav / react-router). expo-router is already the mobile router (since 05b) — **no new dep**. Tabs:
  **Today** + **Library** only (Stats/Settings deferred to their own units, like 06c's two-tab web shell).
- **ThemeControl stays in the Library screen header for now.** Mobile has no app-wide top chrome under a
  bottom-tab IA; a future **Settings tab** owns theme app-wide. Do NOT move it onto Today (would be the
  only control on an otherwise calm home, and Today has no header). Library's header is unchanged.
- **`selectContinueReading` is duplicated into apps/mobile** (pure, byte-identical logic to 06c's web
  selector). This follows the established mobile-mirrors-web-then-defer-dedup precedent (native-clock,
  format-bytes). Do NOT promote it to packages/core in this unit — that would add a second boundary and
  break the standard route. Record a dedup-hoist follow-up (its own micro-unit) in the tracker.

## Design (net-new UI — frontend-design + impeccable; honor ui-context.md tokens)
- **Continue Reading card** (bespoke uniwind, token-driven — invariant #6): the mobile analog of 06c's web
  card. Document **title** in Fraunces (`font-serif`), a quiet "Page {n}" line in Inter (`font-sans`,
  `text-text-muted`), and a primary **Resume** affordance. Card surface `bg-surface-raised border
  border-line`, rounded, cozy spacing; carry the ember-accent bookmark motif (e.g. a left accent edge or
  the dimmed `EmberFlame`) to feel like one app with the web card — but native idioms (Pressable, not a
  web Button). **Empty state**: gentle nudge in brand voice ("Your next chapter awaits — pick a book from
  your library to begin.") with a Pressable that switches to the Library tab. No guilt-tripping.
- **Today screen**: a time-of-day greeting (Fraunces, the emotional anchor) + a quiet date line (muted
  Inter) + the Continue Reading card. Same cozy spacing language as LibraryScreen so the two tabs feel
  unified. Small loading state (token-tinted `ActivityIndicator`, the 04c/library pattern) while the read
  resolves. Greeting/subtitle copy mirrors 06c's voice (reuse the morning/afternoon/evening logic).
- **Bottom tab bar**: token-driven (invariant #6) — resolve token colors via `useResolveClassNames`
  (the 04c spinner pattern) and pass to `Tabs` `screenOptions` (`tabBarActiveTintColor` = accent,
  `tabBarInactiveTintColor` = text-muted, `tabBarStyle` bg = surface, top border = line). Icons via
  `@expo/vector-icons` (**bundled with Expo — no new dep**); Today + Library get distinct, calm icons
  (frontend-design picks). Labels: "Today", "Library". Active tint is the ember accent. The tab bar must
  re-theme live with light/dark.

## Implementation

### `apps/mobile/src/store/native-store.ts` (extend)
Expose the one method 06d deferred — mirror the existing `getReadingPosition` wiring:
- Add to the `NativeStore` interface + factory:
  `listReadingPositions(): Promise<ReadingPosition[]>` → delegates to `@ember/store`'s
  `listReadingPositions(repo)` (already exported from 06a; web-store added the same in 06c). No
  sorting/joining here — that's the selector's job. `ReadingPosition` already imported.

### `apps/mobile/src/today/select-continue-reading.ts` (new — pure, no RN/React)
Byte-for-byte the same logic as `apps/web/src/today/select-continue-reading.ts` (copy it):
- `export interface ContinueReadingItem { docId: string; title: string; page: number; updatedAt: string }`
- `export function selectContinueReading(positions: ReadingPosition[], documents: Document[]): ContinueReadingItem[]`
  — join by `position.id === document.id`, **drop orphans** (missing doc must not crash Today), sort
  `updatedAt` **descending** (encoded-HLC string sort agrees with recency, 06a `encode` invariant), map to
  `{ docId, title, page, updatedAt }`. `Document`/`ReadingPosition` from `@ember/core`. Keep the `.js`
  relative-import convention (Metro resolver carry-forward).

### `apps/mobile/src/today/use-continue-reading.ts` (new hook)
- `useContinueReading(): { items: ContinueReadingItem[]; loading: boolean }` — store from `useNativeStore()`.
- On mount, `Promise.all([store.listReadingPositions(), store.listDocuments()])` → `selectContinueReading`
  → set state. Mirror `use-library.ts`'s cancel-flag + `loading` pattern. **Swallow read errors** (set
  empty, never throw) — Today must render offline even if a read fails (invariant #1; Convex never on the
  read path).

### `apps/mobile/src/today/continue-reading-card.tsx` (new — net-new UI)
- Props `{ item: ContinueReadingItem | undefined; onResume: (docId: string) => void; onBrowseLibrary: () => void }`.
- Renders the latest item (title / "Page {n}" / Resume Pressable → `onResume(item.docId)`), or the empty
  nudge (→ `onBrowseLibrary()`), per the Design section. Bespoke uniwind, token-only.

### `apps/mobile/src/today/today-screen.tsx` (new — net-new UI)
- Greeting + date + `ContinueReadingCard`, using `useContinueReading()`. Page bg on a core `View`
  (`bg-surface`), `SafeAreaView edges={['top']}` for insets only (02d carry-forward: uniwind className is a
  no-op on SafeAreaView). `onResume` → `router.push(\`/reader/${docId}\`)`; `onBrowseLibrary` →
  `router.navigate('/library')` (switch tab). Loading → token-tinted ActivityIndicator.

### expo-router restructure (the tab shell)
Currently `app/index.tsx` renders `LibraryScreen` and `app/reader/[id].tsx` is the reader; `app/_layout.tsx`
is a single `Stack`. Restructure so the reader stays full-screen **outside** the tabs:
- **`app/(tabs)/_layout.tsx`** (new) — `Tabs` with token-driven `screenOptions` (see Design). Two screens:
  `index` (Today, title "Today") and `library` (Library, title "Library"). `headerShown: false` (screens
  own their headers). Resolve token colors via `useResolveClassNames`.
- **`app/(tabs)/index.tsx`** (new) — renders `<TodayScreen/>`.
- **`app/(tabs)/library.tsx`** (new) — renders `<LibraryScreen/>` (unchanged screen; just relocated route).
- **Delete `app/index.tsx`** (its job moves into `(tabs)/library.tsx` + the new Today index).
- **`app/_layout.tsx`** — unchanged conceptually: the root `Stack` (headerShown:false) now contains the
  `(tabs)` group + the existing `reader/[id]` route. expo-router auto-includes both; confirm no explicit
  `<Stack.Screen>` list is required, or add `name="(tabs)"` + `name="reader/[id]"` if needed. StoreProvider/
  ThemeProvider/Toaster wiring stays exactly as is.
- **`app/reader/[id].tsx`** — unchanged. `onBack` → `router.back()` returns to the originating tab.

### Navigation wiring
- Library `DocumentRow` already navigates to `/reader/[id]` — unchanged.
- Today Continue Reading → `router.push('/reader/' + docId)` (06d's resume path runs in the reader exactly
  as on web 06c — no reader changes needed here).

## Dependencies
- **none.** expo-router (mobile router since 05b), `@expo/vector-icons` (bundled with Expo SDK 56),
  `@ember/core`, `@ember/store`, uniwind, react-native-safe-area-context are all already deps. Confirm
  `@expo/vector-icons` resolves without an install (it ships with `expo`); if frontend-design picks an icon
  family that needs a separate package, prefer one already transitively present (do NOT add a new dep
  without flagging — that would re-score the unit).

## Tests
Mobile has **no React test renderer** — all mobile tests are pure `.ts` Vitest (established constraint; the
screens/card/tab bar/hook are **device-verified**, not unit-tested). Cover the pure seam + the store seam:
- `apps/mobile/src/today/select-continue-reading.test.ts` (pure, mirror 06c's web test): joins
  position→document by id; **drops** orphaned positions; sorts most-recent (`updatedAt` desc) first; empty
  inputs → `[]`; maps `docId`/`title`/`page` correctly.
- `apps/mobile/src/tests/native-store-reading-position.test.ts` (extend 06d's file): `listReadingPositions`
  returns all saved positions across distinct docs (thin wrapper over already-tested 06a `@ember/store`).

## Verify when done
- [ ] App launches into a **bottom tab bar** (Today + Library); Today is the default tab. Tapping tabs
      switches screens; the tab bar re-themes with light/dark; active tint is the ember accent.
- [ ] Today's **Continue Reading** card shows the most-recently-read document (title + "Page N"); **Resume**
      opens it full-screen at the saved position (06d resume path, end-to-end). No positions → quiet nudge
      that switches to the Library tab. No streak ember, no goal ring, no percentage.
- [ ] Opening a book from Library → reader → **back** returns to the Library tab; the reader is full-screen
      (no tab bar). A failed read never blanks/crashes Today (invariant #1, offline).
- [ ] `listReadingPositions` exposed on native-store; `selectContinueReading` drops orphans and sorts by
      recency.
- [ ] `pnpm -w typecheck` passes · `pnpm -w test` passes · `pnpm -w lint` clean · `expo export -p android`
      → "Exported: dist" (mobile bundle gate).
- [ ] No invariant violated — #1 (works offline, Convex never on the read path), #6 (token-driven tab bar +
      card + Today, no hardcoded palette). `mergeReadingPosition` stays unused (reconcile is unit 12).
      **packages/core + packages/store + apps/web stay byte-identical** (apps/mobile-only change).

## Routing note
Net-new visual surface — the **Today screen, the Continue Reading card, and the bottom tab bar** are new UI.
So design quality is part of "done": **generate the new UI with `frontend-design`** (distinctive,
production-grade, bespoke uniwind per ui-context — no shadcn on mobile), then **audit with `impeccable`** for
UX/visual/a11y — both must honor `ui-context.md` tokens (Amber Ember palette, Fraunces/Inter, cozy spacing,
warm encouraging voice; the empty state is gentle, never guilt-tripping). Run these in the executor step,
before the fresh-context **Opus** review (which checks the unit against `architecture.md` invariants).
**Device-verify (user, Expo Go, before merge):** launch → lands on Today with a bottom tab bar; with a
previously-read book, the Continue Reading card resumes to the saved page on Resume; switch Today↔Library;
open a book from Library, press back → returns to Library; a never-read library → Today shows the nudge that
jumps to Library; toggle light/dark → tab bar + card + Today re-theme.
```
Chain: Unit 06e ⇄ Issue #60 ⇄ branch feat/60-mobile-today-tab-nav ⇄ spec specs/06e-mobile-today-tab-nav.md ⇄ PR "Closes #60"
```
