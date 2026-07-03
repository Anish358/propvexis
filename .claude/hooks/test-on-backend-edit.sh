#!/usr/bin/env bash
# PostToolUse hook: run the backend test suite after an edit to backend source
# or tests, so regressions surface immediately. Skips frontend/docs/config edits.
#
# Receives the hook payload as JSON on stdin; we pull out file_path without
# needing jq. Exit 2 (with stderr) surfaces a failure back to Claude.
input=$(cat)
file=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

case "$file" in
  */amey-journal/src/*.js|*/amey-journal/test/*.js)
    cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
    if npm test >/tmp/amey-hook-test.log 2>&1; then
      echo "✓ npm test passed after editing $(basename "$file")"
      exit 0
    else
      echo "⚠️ npm test FAILED after editing $file — details:" >&2
      tail -25 /tmp/amey-hook-test.log >&2
      exit 2
    fi
    ;;
  *)
    exit 0  # not a backend source/test file — nothing to do
    ;;
esac
