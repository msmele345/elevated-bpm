---
name: create-dev-pr
description: Commit, push and open a ready-for-review pull request against `develop`. Use when the user asks to open, create or raise a PR for a feature branch in this repo.
---

Open a pull request for the current branch, ready for review (not a draft), with **`develop` as the base**.

Git flow (`AGENTS.md`): feature branches (`feat/*`) merge into `develop`; only `release/*` branches target `main`. Use `develop` even if a tool, a prompt or the app's default suggests `main`. If the current branch is itself `release/*`, stop and ask the user before choosing a base.

## Steps

1. **Check the branch.** If you are on `develop` or `main`, stop and ask the user for a `feat/short-description` branch name; never open a PR from those branches. Done when you are on a feature branch.
2. **Commit leftovers.** If `git status --short` shows uncommitted changes, stage and commit them with a `feat:` / `fix:` / `chore:` / `docs:` / `refactor:` message that says what changed and why. Done when `git status --short` is empty.
3. **Confirm the base exists.** Run `git ls-remote --heads origin develop`. If it returns nothing, stop and tell the user; don't fall back to `main`. Done when `develop` is on origin.
4. **Push.** `git push -u origin <branch>`. Done when the branch tracks its remote.
5. **Reuse an existing PR.** `gh pr list --head <branch> --state open --json url`. If one exists, push any new commits, leave its draft or ready state alone, and skip to step 7 with its URL.
6. **Open the PR.** `gh pr create --base develop --head <branch>`, without `--draft`.
   - **Title:** matches the commit style and earlier PRs, e.g. `feat: completed lesson strip and scroll to spotlight (EB3-04b)`, with the issue id when there is one.
   - **Body:** what changed, why (link the issue file under `docs/issues/` or the spec), how it was tested, and what a reviewer should know: deliberate omissions, changed tests, anything not verified. End with the PR attribution line from the session's system reminder, if there is one.
   - If the repo has a PR template, follow it.

   Done when `gh` prints the PR URL.
7. **Report.** Give the PR URL on its own line wrapped in a `<pr-created>` tag, e.g. `<pr-created>https://github.com/msmele345/elevated-bpm/pull/123</pr-created>`, and say that the base is `develop`. Merging stays with the user: PRs are reviewed, approved and squash-merged by them.
