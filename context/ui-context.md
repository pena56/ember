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

Concrete hex values are TBD in the design pass (unit 02) — directions below, not final.

| Role | Token | Direction |
|---|---|---|
| Accent (the "ember") | `accent` | warm amber/orange; used for streak, goal ring, primary CTAs |
| Surface (light) | `surface` | warm cream/off-white |
| Surface (dark) | `surface` | soft warm charcoal (not pure black) |
| Text primary | `text` | warm near-black / warm off-white |
| Reader paper | `reader.bg` | per reading theme: paper / sepia / night |
| Success/streak-lit | `streak.lit` | glowing ember amber |
| Streak-at-risk | `streak.risk` | muted warning warm tone |

## Typography
- **Headings / numbers** (streak count, book titles, big stats): a warm **serif** — literary feel.
- **Body / UI / labels**: a clean, legible **sans**.
- PDF body text renders as the PDF's own embedded fonts; typography here is app chrome only.
- Font files shared conceptually across clients; load per-platform.

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
No third-party UI kit chosen yet — build a small shared-token-driven component set per client
(RN + web can't share components, but share tokens + patterns). Decide in unit 02.

## Layout Patterns
- Card-based Today screen; generous spacing; soft rounded corners (cozy).
- Bottom tab bar on mobile; sidebar/top nav on web.
- Streak/goal as a recurring glanceable "ember" motif across Today + Stats.
