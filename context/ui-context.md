# UI Context

**Brand:** Ember (app-store title "Ember Reader"). Wordmark = *Ember*; descriptor used for
discovery. **Mood:** warm & cozy — "reading nook by lamplight." The streak is visualized as a
glowing **ember/flame** that you keep lit by reading daily.

## Brand & Voice
*(derived from the established mood — confirm or adjust)*
- **Personality — it IS:** warm, encouraging, calm, literary, personal.
- **It is NOT:** loud/gamified-shouty, clinical/corporate, gimmicky, guilt-tripping.
- **Voice/tone for copy:** gentle and human; celebrate consistency without nagging. A missed day
  is "your ember's dimming," never "STREAK LOST!". Second person, plain language, occasional
  literary warmth. Numbers/stats stay factual and quiet — the encouragement is in the framing,
  not exclamation marks.

## Theme / Tokens
Tokens are **semantic**, defined once in `packages/tokens/` and consumed by both clients (web +
mobile share token values, not components). Themes: **warm-light**, **warm-dark** (soft charcoal,
NOT OLED black), plus reader-only **sepia**. The reader view picks its reading theme
**independently** of app chrome (paper / sepia / night) with brightness + warmth controls.

Concrete values resolved 2026-06-08 ("Amber Ember" palette). Authored as Tailwind v4
`@theme` variables in `packages/tokens`, consumed by both clients (see Component Library).

**Accent (the "ember"):** `accent #E0701B` · dark-variant `#F2913E` · `streak.lit #F59E0B`
· `streak.risk #B98A5E`. Used for streak, goal ring, primary CTAs.

| Role | Token | warm-light | warm-dark (soft charcoal, not OLED) |
|---|---|---|---|
| Surface | `surface` | `#FAF4EA` | `#1C1815` |
| Card / raised | `surface.raised` | `#FFFDF9` | `#272220` |
| Text primary | `text` | `#2A2422` | `#F2E9DB` |
| Text muted | `text.muted` | `#6F665C` | `#A89C8C` |
| Hairline / border | `line` | `#E7DDCB` | `#38312B` |
| Accent | `accent` | `#E0701B` | `#F2913E` |

**Reader themes** (`reader.bg` / `reader.text`, chosen independently of app chrome):
paper `#FBF6EC` / `#2A2422` · sepia `#F2E5CC` / `#4A3F2F` · night `#14110E` / `#C9BEAD`.
Brightness + warmth controls modulate these at render time.

## Typography
Resolved 2026-06-08: **Fraunces** (serif) + **Inter** (sans).
- **Headings / numbers** (streak count, book titles, big stats): **Fraunces** — warm variable
  serif with optical sizing + soft axis; its display numerals carry the hero streak count.
- **Body / UI / labels**: **Inter** — neutral, highly legible, flawless cross-platform.
- Load via `@expo-google-fonts/fraunces` + `@expo-google-fonts/inter` (mobile) and self-hosted
  woff2 / `@fontsource` (web). Pin versions at unit-02 spec time.
- PDF body text renders as the PDF's own embedded fonts; typography here is app chrome only.

## Reader UX
- **Continuous vertical scroll by default**; page-flip mode available as a setting.
- Progress = page + relative offset (0–1) within page (maps across viewports/devices).
- Highlights: text-anchored (character range + page); pixel-rect normalized fallback for
  scanned/image PDFs (no text layer).
- Reading themes + brightness/warmth live in a reader toolbar, separate from app theme.

## App Structure (IA)
Tabs: **Today / Library / Stats** (+ Settings).
- **Today** (home, habit-forward): Continue Reading resume card, streak ember, today's goal
  ring, gentle nudge, recently added.
- **Library**: flat list + **tags** + smart views (Currently Reading / Finished / Unread /
  Recently Added). No folders.
- **Stats**: rich analytics — current/longest streak, weekly heatmap, time + pages
  (today/week), per-book %, reading speed trend, time-of-day patterns, finish ETAs, periodic
  reviews. All derived from the session log.
- **Settings**: sync conflict policy (global + per-file), reading themes, notification prefs
  (incl. primary-device choice), storage quota usage.

## Component Library
**Revised 2026-06-09** (supersedes the 2026-06-08 "bespoke, no UI kit" decision): clients still
can't share components (RN ≠ web), but share tokens + patterns. Styling stays **Tailwind v4**;
component *foundation* now differs per client:
- **Web** (`apps/web`): **build on shadcn/ui** (Radix + Tailwind v4, copied into the repo — not a
  black-box dep). **Handroll a web component only when shadcn has no good equivalent**; otherwise
  compose shadcn primitives. shadcn themes via CSS variables → map those to the Amber Ember token
  values so it stays token-driven (architecture invariant #6 holds — no hardcoded palette). Toasts
  via **Sonner** (shadcn's notification primitive), not inline banners. Dark mode via the existing
  `data-app-theme` provider. (shadcn is web-only — Radix can't target RN.)
- **Mobile** (`apps/mobile`): **bespoke, token-driven** components on **uniwind** (Tailwind v4
  bindings for React Native, Metro — chosen over NativeWind because it natively targets Tailwind v4 /
  RN 0.85 / React 19). No shadcn here; handroll against tokens.
- Semantic tokens authored once in `packages/tokens` as a Tailwind v4 `@theme`, consumed by both
  clients (and by shadcn's CSS-var mapping on web) — preserves invariant #6. `frontend-design` +
  `impeccable` drive quality at build time, now *on top of* shadcn primitives for web.
- Surface: shadcn primitives (Button, Card, Sonner, Dialog, …) on web; bespoke Text/ListRow/TabBar/
  Surface/GoalRing/Ember where shadcn has no fit or the motif is brand-specific (ember/streak).

## Layout Patterns
- Card-based Today screen; generous spacing; soft rounded corners (cozy).
- Bottom tab bar on mobile; sidebar/top nav on web.
- Streak/goal as a recurring glanceable "ember" motif across Today + Stats.
