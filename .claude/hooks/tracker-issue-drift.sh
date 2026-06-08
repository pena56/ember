#!/usr/bin/env bash
# SessionStart hook (reminder only — never blocks).
# Catches between-session drift the Stop-time doc-sync hook can't see: an issue
# referenced as ACTIVE in progress-tracker.md's "Current Goal" was closed/merged
# on GitHub (often via the GitHub UI or a session that never re-touched the tracker).
# Read-only: surfaces a notice; never edits the tracker. Degrades silently with no
# gh / no network / no remote.

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

tracker="context/progress-tracker.md"
[ -f "$tracker" ] || exit 0
command -v gh >/dev/null 2>&1 || exit 0
# Need a GitHub remote + auth, else stay quiet.
gh auth status >/dev/null 2>&1 || exit 0

# Pull just the "## Current Goal" section (active work lives there) up to the next "## ".
goal=$(awk '/^## Current Goal/{f=1;next} /^## /{f=0} f' "$tracker")
[ -z "$goal" ] && exit 0

# Done-markers: if the line carrying an issue ref already says it's finished, it's not drift.
done_re='MERGED|merged|DONE|done|complete|closed|✓'

stale=""
# Iterate each line; for issue refs on a line WITHOUT a done-marker, check GitHub state.
while IFS= read -r line; do
  printf '%s' "$line" | grep -qE "$done_re" && continue
  for n in $(printf '%s' "$line" | grep -oE '#[0-9]+' | tr -d '#' | sort -u); do
    state=$(gh issue view "$n" --json state -q .state 2>/dev/null)
    if [ "$state" = "CLOSED" ]; then
      stale="${stale:+$stale, }#$n"
    fi
  done
done <<EOF
$goal
EOF

[ -z "$stale" ] && exit 0

msg="Tracker drift: progress-tracker.md 'Current Goal' references issue(s) $stale as active, but they are CLOSED on GitHub. Reconcile the tracker (mark MERGED / advance to the next unit) before continuing. Reminder only."
esc=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"systemMessage": "%s", "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "%s"}}\n' "$esc" "$esc"
exit 0
