# Project Context — Ember (titled "Ember Reader")

Local-first, cross-device PDF reader whose differentiator is **encouraging a daily reading
habit** (streaks, rich stats, smart notifications). Learning project — depth over speed.

Always read first: `context/progress-tracker.md` (small — current state, open questions).

Read on demand — load a file only when the task touches its concern:

| If the task involves… | Read |
|---|---|
| data model, sync, offline, conflict resolution, layers, an architectural choice | `context/architecture.md` |
| a new feature, scope question, "should we build X" | `context/project-overview.md` |
| writing/changing code (conventions a linter doesn't cover) | `context/code-standards.md` |
| UI / visual / component / theming / reader-UX work | `context/ui-context.md` |
| how to scope, split, or verify a unit | `context/ai-workflow-rules.md` |

Do not read files outside the task's concern — that wastes tokens.

Verify before done (configure in unit 01, then use):
`pnpm -w typecheck` · `pnpm -w test` · `pnpm -w lint`

After meaningful changes: update `context/progress-tracker.md`. If a change alters
architecture/scope/standards, update that file too. Promote durable rules to Invariants
in `architecture.md`.
