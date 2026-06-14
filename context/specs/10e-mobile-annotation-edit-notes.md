# Unit 10e: mobile reader — highlight edit/recolor/delete + standalone notes/pins

Issue: #94 (part of umbrella Unit 10) · Branch: feat/94-mobile-annotation-edit-notes · Boundary: apps/mobile ONLY
Route: standard — one client boundary; the shared brain is done (10a: core `editAnnotation`, store
`saveAnnotation`/`deleteAnnotation`, the `note` kind already exists) and the WebView bridge + paint layer
exist (10d). No new dep (`react-native-webview` already present). Product/UX forks resolved with user
(10c). Mirrors web 10c onto the mobile WebView bridge.

Fifth and **final** slice of umbrella Unit 10. 10a = shared brain, 10b = web create+render,
10c = web edit/notes, 10d = mobile create+render. **10e makes mobile annotations editable and adds the
standalone `note` kind.**
First verifiable result: *tap a painted highlight → recolor / note / delete it; select text → "Note" → a
pinned note appears in the margin; all of it survives reopening the document.*

## The platform shift (read first — same split as 10d)
The mobile reader is pdf.js inside a WebView. 10d already established the bridge split: the **WebView
(HTML string)** is a dumb painter + reporter (no tokens, no `@ember/core`); **RN** owns everything
core/token-dependent (anchor/quote derivation, `resolveAnchorRects`, the store, the native UI). 10e
extends that split:
- **WebView gains a tap reporter.** Painted overlays (`.ember-hl`) and note glyphs become tappable; a tap
  posts `{ type:'annotationTap', id, rect }` up to RN. The WebView still computes no `quote` and no anchor
  math — it only reports *which annotation id* was tapped + *where* (for editor placement).
- **RN gains the editor + mutations.** RN looks the tapped id up in its flat `annotations` list, opens the
  native editor card, and on recolor / note-edit / delete calls the store. Repaint flows through the
  **existing** `setAnnotations` post (10d) — RN rebuilds `paintMessage` from the mutated list and the
  WebView repaints. No new RN→WebView message is needed for edit/delete; only `annotationTap` (up) and the
  note-kind paint branch are new in the HTML.

This keeps anchor/rect math single-sourced in core (invariant-#5 spirit) and `@ember/core` out of the HTML.

## Product decisions (confirmed with user — carried from 10c, the web mirror)
- **Edit affordance = tap a painted highlight → native editor card** anchored to the tapped rect, with:
  the **4 recolor swatches** (current color marked), a **note textarea** (add / edit / clear the
  highlight's optional note), and a **delete** (trash) control. Calm, not alarmist — no scary confirm
  modal (delete is reversible-enough offline + cheap).
- **Standalone notes = margin pin + dotted underline.** The 10d selection toolbar gains a **Note** button
  (after the 4 swatches). Tapping it creates a `kind:'note'` annotation on the selection (no color fill).
  It renders as a small **ember pin glyph in the page margin** at the anchor's top line, plus a subtle
  **dotted underline** on the anchored text. Tapping the pin (or the underline) opens the editor to
  read / edit / delete the note text.
- **Notes on highlights** live in the editor's textarea; a highlight with a note shows a tiny note-dot
  affordance. Editing to empty clears the note (10a: `editAnnotation` with empty `note` → note removed;
  highlight stays).
- **Note-kind creation requires text.** A `note` made from a selection opens the editor immediately on an
  *unsaved draft* with an empty body; saving empty discards (no record written — 10a forbids empty
  `note`-kind text). Mirror web 10c's transient-draft flow exactly.
- **Scope:** highlight edit/recolor/delete + the note kind together (one cohesive unit), apps/mobile-only.

## Bridge protocol additions (on top of 10d's set)
10d's set: load/setMode/setTheme/gotoPage/setAnnotations/clearSelection (RN→WebView) ↔ bootReady/ready/
page/position/stage/error/geometry/selection/selectionCleared (WebView→RN). Add **one** new message:

**WebView → RN**
- `{ type:'annotationTap', id, rect:{ x, y, width, height } }` — posted when the user taps a painted
  highlight overlay or a note pin/underline. `id` is the annotation id (stamped on the DOM element via
  `dataset.annId`); `rect` is the tapped element's bounding box in **WebView-viewport CSS px**
  (`getBoundingClientRect()`), for positioning the native editor — same coordinate space as 10d's
  `selection.rect`.

(No new RN→WebView message: recolor/note/delete repaint via the existing `setAnnotations` post — RN
rebuilds `paintMessage` from the mutated `annotations` list and the WebView clears+repaints that page.)

## Implementation — `apps/mobile` (the only boundary)

### `apps/mobile/src/store/native-store.ts` — facade additions (only store-surface change)
Mirror web-store 10c exactly; the store is the single place the clock is read; **one mutation = one
`nextStamp()` shared by the edit/delete and its single outbox entry** (invariant #2). Import
`editAnnotation` from `@ember/core` and `deleteAnnotation` from `@ember/store` (alias to avoid the
method-name clash, e.g. `deleteAnnotation as deleteAnnotationRecord`).
- `updateAnnotation(input: { annotation: Annotation; patch: { color?: HighlightColor; note?: string |
  null } }): Promise<Annotation>` —
  `const hlc = clock.nextStamp();`
  `const next = editAnnotation(input.annotation, input.patch, { hlc });`
  `return saveAnnotation({ repo, newOutboxId: () => clock.newOutboxId(), hlc }, next);`
- `deleteAnnotation(id: string): Promise<void>` →
  `deleteAnnotationRecord({ repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() }, id)`.
- Add both to the `NativeStore` interface. `createAnnotation` already accepts `note` (10d) — no change.

### `apps/mobile/src/reader/use-annotations.ts` — extend the hook
Keep `annotations`, `annotationsByPage`, `createHighlight`. Add (mirror web 10c):
- `createNote(input: { anchor: TextAnchor; note: string }): Promise<Annotation | undefined>` — calls
  `store.createAnnotation({ docId, kind:'note', anchor, note })`, appends to state, returns the record.
  Null-store guarded like `createHighlight`. The editor enforces non-empty before calling this.
- `updateAnnotation(input: { annotation; patch: { color?; note? } }): Promise<void>` — calls the store,
  replaces that id in the flat state list (optimistic-after-await; no reload).
- `removeAnnotation(id: string): Promise<void>` — calls `store.deleteAnnotation(id)`, drops that id from
  state.
- Keep state as a flat `Annotation[]`; `annotationsByPage` regroups each render (already does). All
  mutators operate on the flat list by id. Update `UseAnnotationsResult` accordingly.

### `apps/mobile/src/reader/build-reader-html.ts` — tap reporter + note-kind paint (in-HTML JS)
Vanilla JS, no imports/tokens (follow the existing `HIGHLIGHT_HEX`/`READER_PALETTE` convention):
- **Make highlight overlays tappable.** In `paintAnnotations`, for `kind:'highlight'` items: stamp
  `el.dataset.annId = item.id`, set `el.style.pointerEvents = 'auto'` (override the `.ember-hl`
  `pointer-events:none` default — keep the CSS default for note underlines that shouldn't grab text), and
  attach a tap handler (a single delegated `click`/`touchend` listener on the page-wrap, or per-element)
  that posts `{ type:'annotationTap', id, rect: el.getBoundingClientRect() }`. Stop the event so it
  doesn't also start a selection.
- **Note-kind paint branch.** In `paintAnnotations`, branch on `item.kind === 'note'`: instead of a filled
  `.ember-hl`, render (a) a **dotted underline** — a thin bottom-border element (`.ember-note-underline`,
  accent color, low alpha, `border-bottom: 1px dotted`) per box, and (b) a **margin pin** — one small ember
  glyph (`.ember-note-pin`, an inline SVG or a styled dot/▮) positioned at the first box's top, just left of
  the text column (clamp inside on narrow widths). Both carry `dataset.annId` and are `pointer-events:auto`
  + tappable → post `annotationTap`. Notes are NOT painted as a fill. Add the two CSS classes next to
  `.ember-hl` (token-parity hardcode: accent hex with a `// must match --color-accent` comment, same
  exception as `HIGHLIGHT_HEX`).
- Existing `setAnnotations` handler already rebuilds `annotationsByPage` and repaints — note-kind items now
  flow through it (they already carry `kind` in the 10d `PaintItem`). `paintAnnotations` must clear prior
  `.ember-note-underline`/`.ember-note-pin` nodes too (extend the existing `.ember-hl` cleanup query).

### `apps/mobile/src/reader/reader-webview.tsx` — wire the tap message
- Extend `WebViewInMessage` with `{ type:'annotationTap'; id: string; rect: { x; y; width; height } }`.
- Add prop `onAnnotationTap?: (t: { id: string; rect: { x; y; width; height } }) => void`; route it in
  `handleMessage` (mirror the `selection` case). No new outbound post effect (edit/delete repaint via the
  existing `paintMessage`/`setAnnotations` effect).

### `apps/mobile/src/reader/annotation-editor.tsx` — native editor card (new UI)
RN/uniwind floating card (sibling to `selection-toolbar.tsx`), absolutely positioned by the screen at the
tapped rect (same placement/clamp math as the 10d toolbar). Renders nothing when no annotation is editing.
- **Highlight editing** → a swatch row (4 colors; current marked with a ring/check; tapping one calls
  `onRecolor(color)`), a **note `TextInput`** (`multiline`, placeholder "Add a note…"; on blur / Save →
  `onEditNote(text)`; clearing → note removed), and a **delete** control (`onDelete`,
  `accessibilityLabel="Delete highlight"`, trash glyph — calm, no confirm modal).
- **Note editing** (incl. the unsaved draft) → the same `TextInput` (required; Save disabled when empty;
  if a freshly-created draft is closed empty, discard — nothing written, 10a) + delete. No swatches.
- Props: `{ annotation: Annotation; isDraft?: boolean; onRecolor; onEditNote; onDelete; onClose; style }`.
  Token colors only (invariant #6); swatch classes literal `bg-highlight-*` (reuse 10d's `SWATCH_CLASS`
  pattern / safelist). `accessibilityRole`/`accessibilityLabel` on every control; pressed-opacity feedback.

### `apps/mobile/src/reader/selection-toolbar.tsx` — add the Note button
Append a **Note** button after the 4 swatches (a small note/pencil glyph, `accessibilityLabel="Add note"`,
divider before it, same pressed treatment + touch target ≥36 px). New prop `onAddNote: () => void` fired on
tap. Bump `TOOLBAR_WIDTH` in `reader-screen.tsx` for the extra control. Swatch behavior unchanged.

### Wiring — `apps/mobile/src/reader/reader-screen.tsx`
- Pull `annotations`, `createHighlight`, **`createNote`, `updateAnnotation`, `removeAnnotation`** from
  `useAnnotations(docId)`.
- Hold `editing: { annotation: Annotation; rect: Rect; isDraft?: boolean } | null` state. On
  `onAnnotationTap({ id, rect })`, look the id up in `annotations`; set `editing` with the found record +
  rect. Render `<AnnotationEditor>` as an absolute overlay positioned from `editing.rect` (reuse the 10d
  toolbar's `top`/`left` clamp math + `overlayWidth`). `onClose` clears `editing`.
- **Note button (transient draft, mirror web 10c):** `<SelectionToolbar onAddNote={…}>` builds an unsaved
  draft note record from the current `selection.anchor` (a local `Annotation`-shaped object, `kind:'note'`,
  empty `note`, a temporary id), sets `editing = { annotation: draft, rect: selection.rect, isDraft:true }`,
  clears `selection`, and bumps `clearSelectionSignal`. The editor's first **Save** calls
  `createNote({ anchor, note })` (then swaps `editing` to the persisted record or closes); closing empty
  discards (nothing written). This keeps empty `note`-kind records out of the store (10a throws on them).
- **Editor handlers** (all clear/refresh `editing` as appropriate, all flow into `paintMessage` so the
  WebView repaints): `onRecolor(color)` → `updateAnnotation({ annotation, patch:{ color } })`;
  `onEditNote(text)` → `updateAnnotation({ annotation, patch:{ note: text } })` (empty string clears);
  `onDelete` → `removeAnnotation(id)` then clear `editing`.
- Additive only — no change to load/resume/session/page-count/10d-create paths. The 10d
  `menuItems={[]}` native-menu suppression already covers the editor overlay (a tap on a highlight starts no
  text selection, so no native menu competes — carry-forward from 10d satisfied).

## Design quality (UI unit — runs in the executor step, before review)
Net-new UI = the native annotation editor card, the note pin + dotted underline (in-HTML), and the toolbar
Note button. Generate with **`frontend-design`**, audit with **`impeccable`**, honoring `ui-context.md`:
warm Amber-Ember mood, rounded card, comfortable touch targets (≥36–44 px), pressed feedback, every control
`accessibilityLabel`-ed, delete reachable but not alarmist. Tint / underline / pin legible on
paper/sepia/night (verify on device). All RN colors via tokens; the in-HTML accent/highlight hex is the
documented WebView exception (parity-commented, like `HIGHLIGHT_HEX`/`READER_PALETTE`).

## Tests (vitest; pure helpers + store seam only — no headless RN renderer, no real WebView/pdf.js)
- `native-store-annotation.test.ts` (extend): `updateAnnotation` writes **one** record + **one** `put`
  outbox entry with a bumped `updatedAt`, preserving id/createdAt/anchor; recolor changes `color`; note
  edit sets/clears `note`; `deleteAnnotation` removes the record + enqueues **one** `delete` tombstone.
  MemoryRepository + fake clock (mirror web's `web-store-annotation.test.ts` 10c additions).
- `build-reader-html.test.ts` (extend): the generated HTML contains the `annotationTap` post, the
  note-kind paint branch (`ember-note-underline`/`ember-note-pin`), and stamps `dataset.annId` /
  `pointer-events:auto` on tappable overlays (substring assertions, same style as 10d).
- The hook's new mutators, the editor card, the toolbar Note button, the tap bridge, and the in-HTML
  note paint are **device-verified, not unit-tested** (no headless RN renderer / no real WebView —
  05a/07c/08c/09c/10d precedent). Keep `annotation-anchor.test.ts` / `highlight-paint.test.ts` green
  (note-kind already carried in `PaintItem`; add a note-kind case to `highlight-paint.test.ts` if cheap).

## Dependencies
- none new. Reuses 10a's `editAnnotation` (core) + `saveAnnotation`/`deleteAnnotation` (store), 10d's
  WebView bridge + paint layer + native-store `createAnnotation`/`listAnnotations`, and 10b's
  `--color-highlight-*` tokens. No core/store/tokens **package** change (apps/mobile facade + reader files
  only).

## Verify when done
- [ ] Tapping a painted highlight opens the native editor; recoloring, adding/editing/clearing its note,
      and deleting all persist and **survive reopening the document** (each = one HLC-stamped outbox
      entry — invariant #2).
- [ ] The selection toolbar's **Note** button creates a `kind:'note'` annotation shown as a margin pin +
      dotted underline; tapping the pin edits/deletes it; empty notes are never written (10a draft flow).
- [ ] Edits repaint correctly in **both** scroll and paged modes and on lazily-rendered pages (via the
      existing `setAnnotations` post); tint/underline/pin stay legible on paper/sepia/night.
- [ ] `native-store.updateAnnotation`/`deleteAnnotation` each write exactly one outbox entry; no
      core/store/tokens package source changed (apps/mobile-only diff).
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (extended native-store + build-reader-html suites)
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (offline; annotations load + mutate via the local
      repo, Convex never on the path), #2 (every edit/delete = one HLC-stamped outbox entry), #6 (RN colors
      from tokens; the in-HTML hex is the documented WebView exception, parity-commented); core stays pure.
- [ ] **DEVICE-VERIFY (user, Expo Go, before merge):** open a text PDF with 10d highlights → tap one →
      editor opens → recolor / add a note / delete (each survives a full app reload) → select text → Note →
      pinned margin note + dotted underline → tap the pin → edit/delete → switch scroll/paged +
      paper/sepia/night (all legible).
