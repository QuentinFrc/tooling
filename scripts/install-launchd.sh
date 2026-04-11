#!/bin/bash
# Install (or update) launchd agents from this directory
# Usage: ./scripts/install-launchd.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
UID_VAL=$(id -u)

for plist in "$SCRIPT_DIR"/*.plist; do
  [ -f "$plist" ] || continue
  label=$(basename "$plist" .plist)
  dest="$LAUNCH_AGENTS/$(basename "$plist")"

  # Unload if already running
  launchctl bootout "gui/$UID_VAL/$label" 2>/dev/null

  cp "$plist" "$dest"
  launchctl bootstrap "gui/$UID_VAL" "$dest"
  echo "Installed $label"
done
