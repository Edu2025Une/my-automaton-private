# Session Handoff - 2026-08-12

## Starting Point

- Branch before this closing commit: `refactor/standalone-runtime`
- HEAD before this closing commit: `aba20fc security: restrict skills to explicitly activated local files`
- Worktree before this closing task: clean

## Objective

Make the runtime independent with zero technical contact with Conway while preserving legal attribution and historical documentation where required.

## Migration Commits

1. `b43df943 docs: add standalone migration inventory`
2. `cbe4074 refactor: make standalone the only runtime mode`
3. `4ae1577 feat: add secure OpenRouter inference provider`
4. `f236a18 refactor: move resilient HTTP client to neutral infrastructure`
5. `ac9bb76 refactor: remove legacy Conway finance subsystem`
6. `a37271d test: remove obsolete Conway finance expectations`
7. `9f5f6a2 refactor: remove legacy Conway social relay`
8. `07b1f05 refactor: remove legacy Conway replication subsystem`
9. `8d30bf4 refactor: remove legacy Conway identity provisioning and registry`
10. `bf74b21 chore: remove unused identity dependencies`
11. `aba20fc security: restrict skills to explicitly activated local files`

## Current Functional State

- Runtime mode is standalone only.
- Conway fallback, provisioning, registry, relay, replication, finance, credits, x402, and related tools have been removed from executable startup paths.
- OpenRouter is available as an independent provider with strict routing controls.
- OpenAI, Anthropic, and Ollama remain supported independent providers.
- The HTTP client used by independent inference providers is in neutral infrastructure.
- Skills are local-only, not auto-installed, not auto-active by default, and not loaded from DB-only instructions.
- Autonomous skill installation/creation/removal and MCP server installation are not exposed as model tools.

## Validations Passed

- `corepack pnpm run typecheck`
- `corepack pnpm run build`
- Standalone tests: passed
- OpenRouter tests: passed
- Inference and failover tests: passed
- Skills hardening and command-injection tests that avoid SQLite: passed
- `git diff --check`: passed
- Static zero-contact searches were run during the migration.

## Tests Not Approved

- SQLite-loading tests are not approved in this environment.
- `policy-engine.test.ts` and `tools-security.test.ts` currently load `better-sqlite3` through test helpers and are blocked here.
- `context-hardening.test.ts` hung without result in this environment and must not be reported as approved from this session.

## better-sqlite3 Blocker

The native `better-sqlite3` binding does not load in this environment. The available prebuilt binary requires `GLIBC_2.29`; rebuilding locally is blocked because the compiler does not satisfy the C++20 requirement.

Do not keep retrying installation, rebuilds, `pnpm rebuild`, package version changes, lockfile changes, compiler changes, GLIBC changes, or OS-level fixes unless the user explicitly creates a future task for that. Mark affected tests as `BLOCKED_ENVIRONMENT`.

## Remaining Risks

- Residual Conway names may remain in legal attribution, historical docs, package metadata, tests, or code that is not on an executable startup path.
- `src/conway/client.ts` and any remaining infrastructure should be audited before final removal or neutralization.
- Wallet modules are preserved but should remain inactive by default unless a future standalone identity design is explicitly requested.
- Generic `exec`, Git tooling, and MCP infrastructure remain powerful surfaces and need separate policy review.
- SQLite-dependent behavior needs validation in a compatible environment.

## Recommended Next Steps

1. Audit and remove or neutralize `src/conway/client.ts` and remaining Conway infrastructure.
2. Neutralize residual Conway names and types that are no longer legally or historically required.
3. Review wallet as an optional future capability, disabled by default.
4. Audit MCP and generic command execution as a separate security surface.
5. Review package metadata and rebranding separately, without changing LICENSE attribution.
6. Validate SQLite-dependent tests only in an environment with a working `better-sqlite3` binding.
7. Run final zero-contact static search across executable code before any production use.

## Operating Notes

- Do not push without explicit authorization.
- Do not alter migrations or delete historical data unless explicitly requested.
- Keep future commits small and scoped by domain.
- Stop before changing anything if the worktree is unexpectedly dirty.
