# Agent Instructions

## Project State

- Runtime is standalone only.
- No executable path may contact Conway.
- OpenRouter is supported as an independent inference provider.
- Removed Conway subsystems: finance/credits/x402, social relay, replication, SIWE/SIWS provisioning, ERC-8004/registry, and orphaned identity dependencies.
- Skills are local files only and require explicit activation.

## Zero Contact Rule

Do not add or call Conway endpoints, packages, repositories, provisioning, fallback inference, skill reinstall flows, or real Conway services in tests.

Conway references are allowed only in:
- LICENSE or legal attribution.
- Clearly historical documentation.
- Negative zero-contact tests.

## Known SQLite Environment Blocker

In this environment, the native `better-sqlite3` binding does not load. The available prebuilt binary requires `GLIBC_2.29`, and the local compiler does not satisfy the C++20 rebuild requirement.

Treat this as `BLOCKED_ENVIRONMENT`: it is not an approval of SQLite tests and is not automatically a functional regression from the current diff.

Do not reinstall, rebuild, run `pnpm rebuild`, change versions, alter `package.json` or lockfiles, repeatedly run SQLite-loading tests, or try to fix GLIBC, the compiler, or the OS. Do not declare SQLite tests approved.

Unless the user explicitly requests a future better-sqlite3 task, use at most static inspection to identify SQLite-dependent tests and mark them `BLOCKED_ENVIRONMENT`.

## Validation Allowed Here

Known runnable groups:
- `corepack pnpm run typecheck`
- `corepack pnpm run build`
- standalone tests
- OpenRouter tests
- inference/failover tests
- skills hardening tests that do not load SQLite
- `git diff --check`
- static searches

Inspect before running any test with similar names; this list is not a guarantee that every matching file avoids SQLite.

## Change Discipline

- Keep commits small and domain-scoped.
- Do not mix rebranding with functional removal.
- Do not modify LICENSE or migrations without explicit request.
- Do not delete historical data.
- Do not push without authorization.
- Preserve existing work.
- Stop if the worktree is unexpectedly dirty.
