#!/bin/bash
set -euo pipefail

# Always run relative to the script's own location, so this works
# regardless of where it's called from (e.g. cron).
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running scraper..."
uv run radios.py

# Only commit if something actually changed (e.g. radio_tracks.csv,
# or any tracked file). Avoids empty commits when there's nothing new.
if [[ -n "$(git status --porcelain)" ]]; then
    echo "Changes detected, committing..."
    git add -A
    git commit -m "Update radio tracks - $(date '+%Y-%m-%d %H:%M')"
    git push
    echo "Pushed to remote."
else
    echo "No changes to commit."
fi
