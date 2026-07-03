---
description: Summarize current project state (git, PRs, deploy, memory)
allowed-tools: Bash(git*), Bash(gh*), Read
---
Give a concise status report of where the project stands right now:

1. Current branch + `git status -s` (flag uncommitted changes).
2. `git log --oneline -5`.
3. Open PRs: `gh pr list`.
4. Latest deploy: `gh run list --workflow=deploy.yml --limit 1`.
5. Recent CI health: `gh run list --limit 5` (note any failures).
6. Outstanding work: summarize from the project auto-memory (MEMORY.md + any
   relevant detail files).

Present as a short bulleted summary — Done / In flight / Pending. Keep it tight;
don't dump raw command output.
