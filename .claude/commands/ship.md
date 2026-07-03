---
description: Run tests, commit working changes, push to dev, and open a PR to main
argument-hint: [commit message]
allowed-tools: Bash(git*), Bash(npm*), Bash(gh*)
---
Ship the current working changes to a PR (do NOT deploy directly):

1. Run `npm test`. If it fails, STOP and show the failure — do not commit anything.
2. Show `git status -s` and `git diff --stat`, then stage the relevant changed files.
3. Commit. Use "$ARGUMENTS" as the message if provided; otherwise write a concise
   message summarizing the diff. End the message with the Co-Authored-By line.
4. Push the current branch to `dev` (`git push origin dev`).
5. Open a PR `dev` → `main` with `gh pr create` (clear title + body summarizing the change).
6. **Do NOT merge the PR** — report the PR URL and remind the user to merge
   (merging auto-deploys to prod).
