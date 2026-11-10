# A stack of PRs

A ticket's work in PRs that build on each other, each reviewed on its own and merged at once, as #86 → #87 → #88 of #77.

## Branches

The session's branch (`AGENTS.md`, «A cloud session's branch») holds the top of the stack. Each PR below it gets a branch of its own, named `<branch>-<N>` by its issue, pushed at its last commit:

```bash
git push origin <commit>:refs/heads/<branch>-<N>
```

The GitHub MCP's `create_branch` starts a branch only from another branch's tip, not from a commit.

## PRs

- The bottom PR is based on `main`, each next one on the branch below it.
- Each description says `Closes #N` of its own issue (CI's check «Issue» reads it) and names the stack bottom-up by its PRs.
- The bottom PR's description also says `Closes #N` of every issue above it: GitHub closes an issue only for a PR merged into `main`, and the upper PRs merge into branches.
- Checks run on each branch's push; the check «Issue» on each PR.

## Merging the stack

Once every PR is green, from the top down, each with a merge commit (`merge_method: merge`):

1. The top PR into the branch below it.
2. Each next PR into the branch below it. A PR whose base just moved reads «not mergeable» for a few seconds while GitHub recomputes it: read it again, then merge.
3. The bottom PR into `main`. `main` moves once, and the deploy runs once for the whole stack.

Then start the session's branch again from `main` (`AGENTS.md`, «A cloud session's branch»). The lower branches stay for the Owner to delete: a cloud session may not delete a branch.
