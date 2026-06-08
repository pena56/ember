#!/usr/bin/env bash
# Stop hook (reminder only — never blocks).
# If files in a tracked system boundary changed in the working tree but
# context/progress-tracker.md was NOT updated, nudge to sync the docs.
# Boundaries mirror context/architecture.md "System Boundaries".

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

changed=$(git status --porcelain 2>/dev/null | cut -c4-)
[ -z "$changed" ] && exit 0

hit=""
for d in packages/core packages/store packages/tokens apps/mobile apps/web convex; do
  if printf '%s\n' "$changed" | grep -q "^$d/"; then
    hit="${hit:+$hit, }$d"
  fi
done
[ -z "$hit" ] && exit 0

# Tracker already touched this session → assume sync is in progress, stay quiet.
printf '%s\n' "$changed" | grep -q "^context/progress-tracker\.md$" && exit 0

msg="Doc-sync reminder: changed boundaries ($hit) but context/progress-tracker.md was not updated. Before wrapping up, update progress-tracker.md and the matching context file (architecture.md / code-standards.md / ui-context.md). Reminder only."

esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"systemMessage": "%s", "suppressOutput": true}\n' "$esc"
exit 0
