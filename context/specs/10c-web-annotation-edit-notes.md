# Unit 10c: web reader — highlight edit/recolor/delete + standalone notes + pins

Issue: #90 (part of umbrella Unit 10) · Branch: feat/90-web-annotation-edit-notes · Boundary: apps/web ONLY
Route: standard — one client boundary (the shared brain is done: 10a built `editAnnotation` + store
`saveAnnotation`/`deleteAnnotation`; the `note` kind already exists). No new dep (`radix-ui` +
`lucide-react` already installed). Product/UX forks resolved with user 2026-06-13. Mirrors 10b.

Third slice of umbrella Unit 10 (Highlights + notes). 10a = shared brain, 10b = web create+render.
**10c makes existing annotations editable and adds the standalone `note` kind.**
First verifiable result: *click a highlight → recolor / note / delete it; select text → "Note" → a
pinned note appears in the margin; all of it survives reload.*

## Product decisions (confirmed with user, 2026-06-13)
- **Edit affordance = click highlight → popover.** Clicking a painted highlight opens a floating
  popover anchored to the clicked rect with: the **4 recolor swatches** (current color marked), a
  **note textarea** (add / edit / clear the highlight's optional note), and a **delete** (trash) button.
- **Standalone notes = margin pin + dotted underline.** The selection toolbar gains a **Note** button
  (4 swatches + Note, per 10b's deferral). Tapping it creates a `kind:'note'` annotation on the
  selection (no color fill). It renders as a small **ember-pin glyph in the page margin** at the
  anchor's top line, plus a subtle **dotted underline** on the anchored text. Clicking the pin (or the
  underline) opens a popover to read / edit / delete the note text.
- **Notes on highlights** are the highlight popover's textarea; a highlight with a note shows a tiny
  note-dot affordance (so you can tell it carries one). Editing to empty clears the note (10a:
  `editAnnotation` with `note: null`/empty → note removed; highlight stays).
- **Scope:** highlights edit/recolor/delete + the note kind together (one cohesive unit). Mobile = 10d.
- **Note-kind creation requires text.** A `note` made from a selection opens the editor immediately with
  an empty body; saving empty cancels (no record written — 10a forbids empty `note`-kind text).

## Implementation — `apps/web` (the only boundary)

### `apps/web/src/store/web-store.ts` — facade additions (the only store-surface change)
Same wiring shape as `createAnnotation`: the store is the single place the clock is read; **one
mutation = one `nextStamp()` shared by the edit/delete and its single outbox entry** (invariant #2).
- `updateAnnotation(input: { annotation: Annotation; patch: { color?: HighlightColor; note?: string |
  null } }): Promise<Annotation>` —
  `const hlc = clock.nextStamp();`
  `const next = editAnnotation(input.annotation, input.patch, { hlc });`
  `return saveAnnotation({ repo, newOutboxId: () => clock.newOutboxId(), hlc }, next);`
- `deleteAnnotation(id: string): Promise<void>` →
  `deleteAnnotation({ repo, newOutboxId: () => clock.newOutboxId(), hlc: clock.nextStamp() }, id)`.
- Add both to the `WebStore` interface; import `editAnnotation` from `@ember/core` and the store
  `deleteAnnotation` from `@ember/store` (alias the import to avoid the method-name clash, e.g.
  `deleteAnnotation as deleteAnnotationRecord`). `createAnnotation` already accepts `note` for the
  toolbar's Note button — no change there.

### `apps/web/src/reader/use-annotations.ts` — extend the hook
Keep `annotationsByPage` + `createHighlight`. Add:
- `createNote(input: { anchor: TextAnchor; note: string }): Promise<Annotation>` — calls
  `store.createAnnotation({ docId, kind: 'note', anchor, note })`, appends to state, returns the record
  (so the caller can immediately open its editor). If the note is empty, it must not be called (the
  editor enforces this).
- `updateAnnotation(input: { annotation; patch: { color?; note? } }): Promise<void>` — calls the
  store, replaces that id in state (optimistic-after-await; no reload).
- `removeAnnotation(id: string): Promise<void>` — calls `store.deleteAnnotation(id)`, drops that id
  from state.
- Keep state as a flat `Annotation[]`; `annotationsByPage` regroups each render (already does). All
  mutators operate on the flat list by id.

### `apps/web/src/components/ui/popover.tsx` — vendored shadcn primitive (new)
Add via `npx shadcn@latest add popover` (new-york style — imports the already-installed unified
`radix-ui`; **no new npm dep**). Used for both the highlight editor and the note editor so dismiss /
escape / click-outside / focus-return come from Radix, not hand-rolled. Falls under the
`components/ui/**` ESLint relaxation (04d) — do not hand-roll this.

### `apps/web/src/reader/highlight-layer.tsx` — make highlights & note-pins interactive
Currently the layer is `pointer-events-none`. 10c upgrades it to render, per page:
- **Highlight rects** (unchanged paint) but each highlight's rects become a **click target**: wrap a
  highlight's rects so clicking any of them calls `onSelectAnnotation(annotation, rect)` where `rect`
  is the clicked rect's CSS box (for popover anchoring). Set `pointer-events-auto` on the rects, keep
  the outer layer `pointer-events-none` so only the rects are hit. Each highlight target is a
  `<button>` (keyboard-focusable, `aria-label={`Highlight: "${quote}"`}`) so highlights are reachable
  by Tab, not just mouse. A highlight carrying a note shows a small note-dot in its corner.
- **Note anchors** (`kind === 'note'`): for each, resolve rects via `resolveAnchorRects`; render a
  **dotted underline** under the anchored text (a thin bottom border on each rect, accent color, low
  alpha — token-driven) AND a **margin pin** — an ember/pin glyph (lucide `Pin` or a bespoke ember
  SVG) positioned just left of the page (or clamped inside on narrow widths) at the top rect's `y`.
  The pin is a `<button aria-label={`Note: "${quote}"`}>`; clicking it (or the underline) calls
  `onSelectAnnotation(annotation, rect)`.
- Props extend to `{ annotations; geometry; pageWidth; pageHeight; onSelectAnnotation:(a: Annotation,
  rect: {left;top;width;height}) => void }`. Still renders null when `geometry` is undefined. All
  colors via `--color-highlight-*` / accent tokens (invariant #6 — no hardcoded palette). Keep
  `mixBlendMode: var(--highlight-blend)` on the fills.

### `apps/web/src/reader/annotation-popover.tsx` — the editor (new)
One controlled popover, rendered once at reader level, anchored to the currently-selected annotation's
rect (use Radix `PopoverAnchor` at a fixed-positioned 0-size element placed at the rect, or an explicit
virtual anchor). Renders nothing when no annotation is selected.
- **Highlight** selected → swatch row (4 colors; current marked with a ring/check; clicking one calls
  `onRecolor(color)`), a `note` textarea (placeholder "Add a note…"; debounced or on-blur/Save →
  `onEditNote(text)`; clearing → note removed), and a trash button (`onDelete`, `aria-label="Delete
  highlight"`). Calm, not gamified; Inter labels; visible focus rings; `Esc`/click-outside closes.
- **Note** selected → the same textarea (required; Save disabled when empty; if the note was just
  created and the user closes empty, call `onDelete` so no empty `note`-kind record lingers) + trash.
  No swatches (notes have no color).
- Props: `{ annotation: Annotation | null; rect: Rect | null; onRecolor; onEditNote; onDelete; onClose }`.
- Voice: warm/quiet per ui-context (e.g. delete is a plain trash button, no scary confirm modal —
  delete is reversible-enough offline + cheap; a tooltip "Remove" suffices).

### `apps/web/src/reader/selection-toolbar.tsx` — add the Note button
Append a **Note** button after the 4 swatches (a small `Pencil`/`StickyNote` lucide icon, `aria-label
="Add note"`, same focus-ring treatment, divider before it). On click: resolve the anchor exactly like
a swatch (`selectionToTextAnchor`), then call a new `onCreateNote({ anchor })` prop (NOT `onCreate`),
clear the selection, and signal the reader to open the new note's editor. Bump `TOOLBAR_WIDTH` for the
extra control. Swatch behavior unchanged. Props gain `onCreateNote: (input: { anchor: TextAnchor }) =>
void`.

### Wiring — `apps/web/src/reader/reader-page.tsx`
- Pull `createNote`, `updateAnnotation`, `removeAnnotation` from `useAnnotations` (alongside the
  existing `annotationsByPage`, `createHighlight`).
- Hold `selected: { annotation: Annotation; rect: Rect } | null` state. `onSelectAnnotation` (threaded
  to each `PdfPage` → `HighlightLayer`) sets it; `<AnnotationPopover>` renders it; `onClose` clears it.
- `<SelectionToolbar>` gains `onCreateNote={async ({ anchor }) => { const n = await createNote({
  anchor, note: '' is invalid → }` — actually: create opens the editor on an *unsaved* draft. Simplest:
  Note button creates the record only on first Save. **Chosen flow:** Note button sets `selected` to a
  transient draft `{ kind:'note', anchor, note:'' }` (not yet persisted) and opens the popover; the
  popover's first Save calls `createNote`; closing empty discards (nothing written). This avoids empty
  `note`-kind records (10a throws on those). Document this draft path in the popover.
- Thread `onSelectAnnotation` through `ScrollReader`/`PagedReader` → `PdfPage` → `HighlightLayer`
  (same pattern as `onTextGeometry`/`annotations`). Keep paged + scroll modes working. The popover and
  selection toolbar both live inside the `data-reader-theme` wrapper so tokens resolve.
- Rect coordinates: `HighlightLayer` rects are page-relative; convert to viewport coords for the
  fixed-position popover anchor via the clicked element's `getBoundingClientRect()` (pass that up),
  mirroring how `SelectionToolbar` positions off `range.getBoundingClientRect()`.

### `apps/web/src/reader/pdf-page.tsx` — pass the callback down
Accept `onSelectAnnotation` and forward it to `<HighlightLayer>`. No change to the canvas/text-layer
render path or the 10b flicker-fix ref.

## Design quality (UI unit — runs in the executor step, before review)
Net-new UI (annotation popover, note pin/underline, recolor swatch row, Note toolbar button) →
generate with **`frontend-design`**, then audit with **`impeccable`**, honoring `ui-context.md`:
warm Amber-Ember mood, rounded corners, Inter labels, `focus-visible` rings everywhere, every
interactive target keyboard-reachable with an `aria-label`, the popover dismissible via `Esc`/outside
click (Radix), delete reachable but not alarmist. Tint/underline/pin legible on paper/sepia/night.
All colors via tokens (`--color-highlight-*`, accent) — invariant #6, no hardcoded palette.

## Tests (jsdom; feed DOM/geometry fixtures — never spin a real pdf.js worker)
- `web-store-annotation.test.ts` (extend): `updateAnnotation` writes **one** record + **one** `put`
  outbox entry with a bumped `updatedAt`, preserving id/createdAt/anchor; recolor changes `color`;
  note edit sets/clears `note`; `deleteAnnotation` removes the record + enqueues **one** `delete`
  tombstone. Uses MemoryRepository + fake clock.
- `use-annotations.test.tsx` (extend): `createNote` persists a `kind:'note'` record and appends to
  `annotationsByPage`; `updateAnnotation` replaces in place (recolor + note); `removeAnnotation` drops
  it — all without a reload.
- `highlight-layer.test.tsx` (extend): clicking a highlight rect fires `onSelectAnnotation` with the
  annotation + a rect; a `kind:'note'` annotation renders a pin button + dotted underline and is NOT
  painted as a fill; highlight carrying a note shows the note-dot; nothing renders when geometry is
  undefined.
- `annotation-popover.test.tsx` (new): highlight → swatch click calls `onRecolor`; textarea
  save calls `onEditNote`; trash calls `onDelete`; note → empty save is disabled / discards; `Esc`
  closes. (Render with a stub `annotation` + `rect`.)
- `selection-toolbar.test.tsx` (extend): the Note button calls `onCreateNote` with the resolved anchor
  (not `onCreate`); swatch path unchanged.
- Follow existing reader test patterns (`highlight-layer.test.tsx`, `selection-toolbar.test.tsx`).

## Dependencies
- none new. `radix-ui@^1.5.0` + `lucide-react@^1.17.0` already in apps/web; the shadcn `popover.tsx`
  is a vendored component over the existing `radix-ui`. Reuses 10a's `editAnnotation` (core) +
  `saveAnnotation`/`deleteAnnotation` (store) and 10b's `selection-anchor`/`web-store.createAnnotation`.

## Verify when done
- [ ] Clicking a highlight opens a popover; recoloring, adding/editing/clearing its note, and deleting
      all persist and **survive reload** (each is one HLC-stamped outbox entry — invariant #2).
- [ ] The selection toolbar's **Note** button creates a `kind:'note'` annotation; it shows as a margin
      pin + dotted underline; clicking the pin edits/deletes it; empty notes are never written (10a).
- [ ] Highlights and note pins are keyboard-reachable (`Tab` + `aria-label`), the popover closes on
      `Esc`/outside click, and everything stays legible on paper/sepia/night.
- [ ] `web-store.updateAnnotation`/`deleteAnnotation` each write exactly one outbox entry; no
      core/store source changed beyond the web facade.
- [ ] `pnpm -w typecheck` passes
- [ ] `pnpm -w test` passes (extended web suites + new annotation-popover test)
- [ ] `pnpm -w lint` clean
- [ ] No invariant in architecture.md violated — esp. #1 (offline; annotations load + mutate via the
      local repo, Convex never on the path), #2 (every edit/delete = one HLC-stamped outbox entry),
      #6 (highlight/accent colors from tokens, not components); core stays pure (all DOM/popover logic
      in apps/web).
