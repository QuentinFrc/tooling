wt() {
  local wt_root="${WT_ROOT:-/Volumes/Dev/worktrees}"

  if [[ "$1" == "cd" && -n "$2" ]]; then
    local project=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
    local dir="${2//\//-}"
    local target="$wt_root/$project/$dir"
    [[ -d "$target" ]] && cd "$target" || echo "Not found: $target"
  elif [[ "$1" == "root" ]]; then
    local root=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/worktree //')
    [[ -n "$root" ]] && cd "$root" || echo "Not in a git repository"
  elif [[ "$1" == "cd" ]]; then
    local tmpfile=$(mktemp)
    __WT_CD_TMP="$tmpfile" command wt-cli "$@"
    local target=$(cat "$tmpfile" 2>/dev/null)
    rm -f "$tmpfile"
    [[ -n "$target" && -d "$target" ]] && cd "$target"
  else
    command wt-cli "$@"
  fi
}
