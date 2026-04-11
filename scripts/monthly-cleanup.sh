#!/bin/bash
# Monthly cache cleanup — run via launchd or manually
# Logs to ~/Library/Logs/monthly-cleanup.log

LOG="$HOME/Library/Logs/monthly-cleanup.log"
echo "=== $(date) ===" >> "$LOG"

# Homebrew: remove old formula versions and stale downloads
if command -v brew &>/dev/null; then
  echo "[brew cleanup]" >> "$LOG"
  brew cleanup 2>&1 >> "$LOG"
else
  echo "[brew] not found, skipping" >> "$LOG"
fi

# pnpm: prune orphaned packages from the content-addressable store
if command -v pnpm &>/dev/null; then
  echo "[pnpm store prune]" >> "$LOG"
  pnpm store prune 2>&1 >> "$LOG"
else
  echo "[pnpm] not found, skipping" >> "$LOG"
fi

echo "=== done ===" >> "$LOG"
