# Ember (Ember Reader)

## Overview
A local-first PDF reader for people who want to **build a consistent reading habit**. It works
fully offline on every device, syncs reading progress + files + annotations across devices, and
turns reading into a habit through streaks, rich analytics, and a smart notification engine.
Differentiation is the habit layer, not PDF rendering. Built as a learning project — the hard
subsystems (offline-first sync, conflict resolution, cross-renderer annotation, notification
coordination) are the point, not obstacles to route around.

## Core User Flow
1. Open the app (works offline) → land on **Today**: Continue Reading card, streak ember,
   today's goal ring, gentle nudge.
2. Open a PDF → read in continuous scroll; active reading time + pages are tracked (idle-aware).
3. Highlight / take notes; progress is captured locally.
4. Later, on another device (phone/laptop web), resume from the exact position — files,
   progress, and annotations have synced.
5. Stats tab shows rich analytics; notifications nudge at learned best-times and protect streaks.

## Features (planned)
- Offline-first reading on **Expo (mobile)** + **React PWA (web)**.
- Cross-device sync of **files + metadata** via Convex (sync server, not on-device source of truth).
- Reading-habit engine: sessions → streaks (goal + freezes) → rich stats.
- Hybrid smart notifications (local scheduled + server push, de-duplicated across devices).
- Text-anchored highlights/notes (pixel-rect fallback for scanned PDFs).
- Anonymous-local identity, claimed into an account to enable sync.
- Library organized by tags + smart views.

## Scope
### In scope (v1 — "build it all", learning project, no launch pressure)
- Both clients fully offline-first; full sync + conflict-resolution UI.
- File storage with quota + per-file cap; encrypted at rest.
- Streaks, goals, rich analytics, hybrid smart notifications.
- Tags + smart views; warm light/dark/sepia theming.
### Out of scope (deferred)
- End-to-end (zero-knowledge) file encryption — possible later premium tier.
- OCR for scanned PDFs (use pixel-rect highlight fallback instead).
- Gamification/badges beyond streaks (revisit later).
- Folders/hierarchy (tags only).

## Success Criteria
- A PDF can be opened and read with **zero network** on both clients; progress/highlights persist.
- Read on phone offline + laptop offline, then both sync → position/annotations reconcile per
  the documented conflict rules (no silent data loss).
- Streak/stats computed identically regardless of which device produced which sessions.
- Same nudge never fires on more than one device for the same day/type.
