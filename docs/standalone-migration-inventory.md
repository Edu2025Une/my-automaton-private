# Standalone Migration Inventory

Date: 2026-08-11
Branch: `refactor/standalone-runtime`
Scope: inventory only. No runtime behavior, source code, package metadata, lockfile, workflow, test, database, README, or license file was changed.

## 1. Executive Summary

This repository is still tightly coupled to Conway across runtime startup, package identity, provisioning, inference, sandbox execution, credits, x402 payments, social relay, ERC-8004/on-chain identity, replication, domain/DNS tooling, documentation, tests, and lockfiles.

The broad static scan found `139` files with direct or indirect Conway-related references. The most critical blockers to standalone operation are:

- The main runtime requires a Conway API key before the agent loop starts.
- Default configuration points to `https://api.conway.tech` and `https://social.conway.tech`.
- First-run setup attempts Conway API key provisioning through SIWE/SIWS.
- The Conway client owns sandbox, credits, automaton registration, domain/DNS, and model-list behavior.
- Inference can be routed through Conway and can also rewrite OpenAI-compatible inference to `${conwayApiUrl}/v1`.
- Startup can automatically buy Conway credits from USDC through x402.
- Child spawning clones `https://github.com/Conway-Research/automaton.git`.
- Agent tools expose Conway credits, sandboxes, domains, DNS, social relay, ERC-8004, x402, and child funding operations.
- Tests and docs encode Conway as the expected platform contract.

This first migration step should not remove these features directly. The safe path is to introduce a standalone runtime boundary and a zero-contact mode first, then remove or plugin-isolate Conway-specific modules behind explicit opt-in configuration.

## 2. Files And Lines Found

The table below lists the primary coupling points. The full broad file set is represented by the `139` file count from the static scan.

| File | Lines | Symbol or reference | Area | Purpose | Criticality |
|---|---:|---|---|---|---|
| `package.json` | 2-4 | `@conway/automaton`, Conway description | configuration | npm package identity and branding | high |
| `package.json` | 22-30 | `conway-automaton`, upstream repo, homepage | configuration | CLI alias, repository URL, homepage | high |
| `package.json` | 58-67 | `openai`, `@solana/web3.js`, `siwe`, `tweetnacl`, `viem` | identity / inference / finance | provider, wallet, SIWE/SIWS, chain/x402 support | medium |
| `packages/cli/package.json` | 2-4 | `@conway/automaton-cli` | configuration | CLI package identity | high |
| `packages/cli/package.json` | 17 | `@conway/automaton` workspace dependency | configuration | CLI imports runtime package namespace | high |
| `packages/cli/src/runtime-shims.d.ts` | 1-20 | `@conway/automaton/*`, `conwayApiUrl`, `conwayApiKey` | configuration | CLI type shims for runtime exports | high |
| `src/index.ts` | 12-17 | wallet, config, Conway client, inference client | infrastructure | runtime bootstrap imports Conway-owned services | critical |
| `src/index.ts` | 49-71 | Conway banner and env help | documentation / configuration | visible CLI branding and Conway env contract | medium |
| `src/index.ts` | 98-106 | `--provision` | identity | provisions Conway API key | critical |
| `src/index.ts` | 186-203 | `apiKey` requirement | configuration | blocks runtime without Conway API key | critical |
| `src/index.ts` | 241-277 | `createConwayClient`, `registerAutomaton` | infrastructure | registers automaton with Conway API | critical |
| `src/index.ts` | 287-297 | `createInferenceClient` with `conwayApiUrl/apiKey` | inference | model calls can route through Conway | critical |
| `src/index.ts` | 303-308 | `createSocialClient(config.socialRelayUrl)` | communication | enables Conway social relay | high |
| `src/index.ts` | 339-369 | `bootstrapTopup` | finance | startup USDC-to-credit purchase path | critical |
| `src/index.ts` | 371-388 | heartbeat daemon context | infrastructure | background tasks receive Conway and social clients | high |
| `src/config.ts` | 33-36 | config path fallback | configuration | reads `~/.automaton/config.json` | medium |
| `src/config.ts` | 117-160 | `registeredWithConway`, `conwayApiUrl`, `conwayApiKey`, `sandboxId` | configuration | persists Conway runtime state | critical |
| `src/config.ts` | 141-143 | `https://api.conway.tech` | configuration | default API endpoint | critical |
| `src/types.ts` | 44-75 | `AutomatonConfig` Conway fields | configuration | canonical config contract | critical |
| `src/types.ts` | 80-92 | default API and social relay URLs | configuration / communication | default outbound endpoints | critical |
| `src/types.ts` | 357-400 | `ConwayClient` interface | infrastructure | sandbox, credits, domains, DNS, model registry | critical |
| `src/types.ts` | 571-592 | `DEFAULT_TREASURY_POLICY`, `x402AllowedDomains` | finance | allows `conway.tech` x402 payments | high |
| `src/types.ts` | 770-840 | ERC-8004 and child lifecycle types | identity / replication | on-chain registry and child agent model | medium |
| `src/conway/client.ts` | 1-7 | Conway API Client | infrastructure | control-plane client for sandbox/credits/domains | critical |
| `src/conway/client.ts` | 38-64 | request helper | infrastructure | authenticated `${apiUrl}${path}` calls | critical |
| `src/conway/client.ts` | 106-247 | sandbox exec/files/ports | infrastructure | Conway sandbox operations with local fallback | critical |
| `src/conway/client.ts` | 252-325 | sandboxes and credits | infrastructure / finance | create/list sandbox and credit balance/pricing/transfer | critical |
| `src/conway/client.ts` | 454 | `/v1/automatons/register` | infrastructure | Conway runtime registration | critical |
| `src/conway/client.ts` | 459-536 | `/v1/domains/*` | infrastructure | Conway domain and DNS tools | high |
| `src/conway/client.ts` | 541-549 | `https://inference.conway.tech/v1/models` | inference | Conway model discovery | high |
| `src/identity/provision.ts` | 20 | `https://api.conway.tech` | identity | default provisioning API | critical |
| `src/identity/provision.ts` | 64-85 | `/v1/auth/nonce` | identity | SIWE/SIWS auth nonce request | critical |
| `src/identity/provision.ts` | 90-117 | `conway.tech`, `/v1/auth/verify` | identity | signed login message binds to Conway domain | critical |
| `src/identity/provision.ts` | 126-151 | `/v1/auth/verify`, `/v1/auth/api-keys` | identity | API key creation | critical |
| `src/identity/provision.ts` | 174-190 | `/v1/automaton/register-parent` | replication / identity | parent registration with Conway | high |
| `src/conway/inference.ts` | 34-120 | `backend === "conway"` | inference | Conway inference backend selection | critical |
| `src/conway/inference.ts` | 211-222 | `${params.apiUrl}/v1/chat/completions` | inference | OpenAI-compatible Conway inference endpoint | critical |
| `src/conway/inference.ts` | 305-314 | Anthropic endpoint | inference | external non-Conway network call | medium |
| `src/inference/provider-registry.ts` | 75,120,165,210,543 | OpenAI/Groq/Together/Ollama/default URLs | inference | dynamic external model providers | medium |
| `src/agent/loop.ts` | 142-169 | `CONWAY_API_KEY`, `OPENAI_BASE_URL=${conwayApiUrl}/v1` | inference / configuration | env propagation and Conway fallback | critical |
| `src/conway/topup.ts` | 1-80 | USDC to Conway credits | finance | x402 credit top-up flow | critical |
| `src/conway/x402.ts` | 212,261,297-392 | Solana/Base RPC and x402 fetch | finance | on-chain payment and paid fetch transport | critical |
| `src/social/client.ts` | 101-194 | `/v1/messages`, `/poll`, `/count` | communication | signed social relay API calls | high |
| `packages/cli/src/commands/send.ts` | 47-58 | `SOCIAL_RELAY_URL`, `https://social.conway.tech` | communication | CLI message send through relay | high |
| `packages/cli/src/commands/fund.ts` | 28-58 | `conwayApiKey`, `https://api.conway.tech`, credits transfer | finance | CLI Conway credit transfer | critical |
| `src/setup/wizard.ts` | 48-76 | Conway API key setup | identity / configuration | first-run provisioning or manual key | critical |
| `src/setup/wizard.ts` | 99-125 | inference default to Conway | inference | setup assumes Conway if BYOK absent | high |
| `src/setup/wizard.ts` | 153-178 | sandbox detection and `registeredWithConway` | infrastructure | environment-to-config bridge | high |
| `src/setup/wizard.ts` | 201-204 | default skills names | documentation / tools | installs `conway-compute`, `conway-payments`, `survival` | medium |
| `src/setup/wizard.ts` | 215-237 | Conway Cloud funding panel | finance / documentation | instructs Conway credits/dashboard funding | medium |
| `src/setup/environment.ts` | 10-11 | `CONWAY_SANDBOX_ID` | infrastructure | detects Conway sandbox runtime | high |
| `src/replication/spawn.ts` | 105-133 | `createSandbox`, upstream clone URL | replication | child sandbox creation and original repo clone | critical |
| `src/replication/spawn.ts` | 267-273 | legacy original repo clone URL | replication | second child bootstrap path | critical |
| `src/heartbeat/tasks.ts` | multiple | credits, USDC, social inbox, model refresh, child cleanup | infrastructure / finance / communication | background Conway-dependent actions | high |
| `src/self-mod/upstream.ts` | 33-50 | remote origin and `git fetch origin main` | replication / update | contacts configured git remote for updates | medium |
| `src/registry/erc8004.ts` | 94-97 | `AUTOMATON_RPC_URL` | identity | on-chain registry RPC selection | medium |
| `src/registry/discovery.ts` | 331 | `fetch(fetchUrl)` | communication / identity | dynamic agent-card fetch | medium |
| `src/state/schema.ts` | 119-179 | `children`, `registry`, `reputation`, `inbox_messages` | database | replication, registry, and social state | high |
| `src/state/schema.ts` | 194-225 | `policy_decisions`, `spend_tracking` | database / finance | authority and spending state | medium |
| `src/state/schema.ts` | 484-556 | `inference_costs`, `model_registry`, `child_lifecycle_events`, `discovered_agents_cache`, `onchain_transactions` | database | inference, replication, registry, payment state | high |
| `src/agent/tools.ts` | 251-392 | `check_credits`, `create_sandbox`, `list_sandboxes` | infrastructure / finance | Conway tool surface exposed to agent | critical |
| `src/agent/tools.ts` | 999-1049 | `transfer_credits`, skill installer | finance / tools | credit transfer and external skill install | critical |
| `src/agent/tools.ts` | 1396-1582 | ERC-8004 registry tools | identity / communication | on-chain registration, discovery, reputation | high |
| `src/agent/tools.ts` | 1601-1964 | child spawn/fund/status/prune tools | replication / finance | child creation and funding operations | critical |
| `src/agent/tools.ts` | 1988-2071 | `send_message`, `list_models`, `switch_model` | communication / inference | social relay and model control | high |
| `src/agent/tools.ts` | 2176-2274 | domain and DNS tools | infrastructure | Conway domain/DNS management | high |
| `src/agent/tools.ts` | 2727-2749 | `x402_fetch` | finance / network | paid HTTP fetch capability | critical |
| `scripts/automaton.sh` | 3-6 | `conway.tech`, original repo URL | scripts | one-line install and clone source | critical |
| `README.md` | 23-41,72,101-110 | Conway docs, install, Cloud, ERC-8004 | documentation | user-facing Conway positioning | medium |
| `DOCUMENTATION.md` | 47-80,132-173,199-301 | setup, provisioning, funding, config | documentation | complete Conway operational guide | medium |
| `ARCHITECTURE.md` | 697 | `conwayApiUrl` default | documentation | architecture config contract | low |
| `.github/workflows/ci.yml` | 1-46 | CI workflows | tests / workflows | runs tests that include Conway-coupled suites | medium |
| `.github/workflows/release.yml` | 1-17 | release workflow | workflows | builds and tests current Conway package identity | medium |
| `pnpm-lock.yaml` | multiple | package identity and dependency graph | lockfiles | locks Conway-named workspace package | medium |

## 3. Classification By Area

### Infrastructure

- `src/conway/client.ts` is the core control-plane adapter. It owns sandbox execution, file read/write, port exposure, sandbox create/list/delete, credit APIs, automaton registration, domains, DNS, and model listing.
- `src/index.ts` instantiates the Conway client during startup and registers the automaton.
- `src/setup/environment.ts` detects `CONWAY_SANDBOX_ID`.
- `src/heartbeat/tasks.ts` uses the Conway client for health, credits, model refresh, and child cleanup.
- `src/agent/tools.ts` exposes VM/sandbox/domain/DNS tools to the agent.

### Inference

- `src/conway/inference.ts` has a Conway backend and OpenAI-compatible request path.
- `src/agent/loop.ts` can set `OPENAI_BASE_URL` to `${config.conwayApiUrl}/v1` when no OpenAI key exists.
- `src/conway/client.ts` queries `https://inference.conway.tech/v1/models`.
- `src/inference/provider-registry.ts` contains non-Conway external defaults for OpenAI, Groq, Together, and Ollama.

### Finance

- `src/conway/credits.ts`, `src/conway/topup.ts`, and `src/conway/x402.ts` implement credits, auto-top-up, x402, USDC balance checks, and on-chain payments.
- `src/agent/tools.ts` exposes `check_credits`, `check_usdc_balance`, `topup_credits`, `transfer_credits`, `fund_child`, `check_inference_spending`, and `x402_fetch`.
- `packages/cli/src/commands/fund.ts` transfers Conway credits through the Conway API.

### Identity

- `src/identity/provision.ts` provisions Conway API keys through SIWE/SIWS.
- `src/identity/wallet.ts`, `src/identity/chain.ts`, and `src/identity/siws.ts` support EVM/Solana signing identities.
- `src/registry/erc8004.ts` implements ERC-8004 registration and feedback through configured/public RPC.

### Communication

- `src/social/client.ts` sends and polls signed social messages.
- `src/types.ts` defaults `socialRelayUrl` to `https://social.conway.tech`.
- `packages/cli/src/commands/send.ts` defaults to `https://social.conway.tech`.
- `src/registry/discovery.ts` fetches remote agent cards from dynamic URLs.

### Replication

- `src/replication/spawn.ts` creates child Conway sandboxes, initializes child wallets, funds children, and clones the original Conway repository.
- `src/replication/*` modules track lineage, lifecycle, health, messaging, constitution propagation, and cleanup.
- `src/agent/tools.ts` exposes `spawn_child`, `list_children`, `fund_child`, `check_child_status`, `start_child`, `message_child`, `verify_child_constitution`, and `prune_dead_children`.

### Configuration

- `src/types.ts` and `src/config.ts` define and persist `conwayApiUrl`, `conwayApiKey`, `sandboxId`, `registeredWithConway`, `socialRelayUrl`, provider keys, wallet address, RPC URL, and treasury policy.
- `package.json` and `packages/cli/package.json` still use the `@conway/*` namespace.
- `packages/cli/src/runtime-shims.d.ts` imports runtime types from `@conway/automaton/*`.

### Documentation

- `README.md`, `DOCUMENTATION.md`, `ARCHITECTURE.md`, `constitution.md`, and `scripts/conways-rules.txt` describe Conway Cloud, Conway credits, x402, self-replication, ERC-8004, social relay, and upstream repository URLs.
- `scripts/automaton.sh` installs from `conway.tech` and clones `Conway-Research/automaton`.

### Tests

- Tests reference Conway defaults, mocks, tool names, credit behavior, policy rules, SIWS/SIWE provisioning, social relay validation, low-compute mode, replication, ERC-8004 discovery, data-layer schemas, and command-injection safety.
- The CI workflow runs all these suites; after decoupling, failing tests will likely indicate expected behavior that must be rewritten rather than simply removed.

## 4. Known Network Calls

### Conway endpoints

- `https://api.conway.tech` default API endpoint from config and provisioning.
- `${apiUrl}/v1/auth/nonce`
- `${apiUrl}/v1/auth/verify`
- `${apiUrl}/v1/auth/api-keys`
- `${apiUrl}/v1/automaton/register-parent`
- `${apiUrl}/v1/automatons/register`
- `${apiUrl}/v1/sandboxes`
- `${apiUrl}/v1/sandboxes/:id/exec`
- `${apiUrl}/v1/sandboxes/:id/files/upload/json`
- `${apiUrl}/v1/sandboxes/:id/files/read`
- `${apiUrl}/v1/sandboxes/:id/ports/expose`
- `${apiUrl}/v1/sandboxes/:id/ports/:port`
- `${apiUrl}/v1/credits/balance`
- `${apiUrl}/v1/credits/pricing`
- `${apiUrl}/v1/credits/transfer`
- `${apiUrl}/v1/credits/transfers`
- `${apiUrl}/v1/domains/search`
- `${apiUrl}/v1/domains/register`
- `${apiUrl}/v1/domains/:domain/dns`
- `${apiUrl}/pay/:amountUsd/:walletAddress`
- `https://inference.conway.tech/v1/models`
- `${config.conwayApiUrl}/v1/chat/completions`

### Conway social and docs/install endpoints

- `https://social.conway.tech/v1/messages`
- `https://social.conway.tech/v1/messages/poll`
- `https://social.conway.tech/v1/messages/count`
- `https://app.conway.tech`
- `https://conway.tech/automaton.sh`
- `https://github.com/Conway-Research/automaton.git`

### Non-Conway external endpoints that still matter for zero-contact proof

- `https://api.openai.com/v1`
- `https://api.anthropic.com/v1/messages`
- `https://api.groq.com/openai/v1`
- `https://api.together.xyz/v1`
- `http://localhost:11434/v1` and `http://localhost:11434`
- `https://api.mainnet-beta.solana.com`
- Base/EVM RPC from `AUTOMATON_RPC_URL`, configured `rpcUrl`, or viem defaults such as Base public RPC.
- `https://ipfs.io` default IPFS gateway for discovery.
- Dynamic agent-card URLs accepted by registry discovery.
- `git fetch origin main` in `src/self-mod/upstream.ts`, which contacts whatever `origin` is configured to.
- `git clone` in runtime tools and child-spawn paths when the agent invokes those tools.
- Dynamic URL in `x402_fetch`, guarded by policy but still an external network capability.

## 5. Environment Variables And Credential Files

### Environment variables

- `CONWAY_API_URL`
- `CONWAY_API_KEY`
- `CONWAY_SANDBOX_ID`
- `SOCIAL_RELAY_URL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `ANTHROPIC_API_KEY`
- `OLLAMA_BASE_URL`
- `AUTOMATON_RPC_URL`
- `SOLANA_RPC_URL`
- `AUTOMATON_CREDITS_BALANCE`
- `AUTOMATON_INFERENCE_TASK_TYPE`

### Credential and state files

- `~/.automaton/wallet.json`: private wallet key material.
- `~/.automaton/config.json`: provisioning API key and wallet metadata written by provisioning/manual key fallback.
- `~/.automaton/automaton.json`: runtime config, including Conway API URL/key, sandbox ID, social relay URL, provider keys, wallet address, creator address, treasury policy, and RPC URL.
- `~/.automaton/state.db`: SQLite state; contains identity, transactions, child records, registry/reputation state, spend tracking, inference costs, model registry, on-chain transactions, and memory state.
- `~/.automaton/SOUL.md`: generated identity/purpose file.
- `~/.automaton/heartbeat.yml`: heartbeat schedule and tasks.
- `~/.automaton/skills`: default skill install path; first-run setup mentions `conway-compute` and `conway-payments`.

No credential values were read, printed, or validated during this inventory.

## 6. Related NPM Dependencies

The repository does not depend on an external npm package named `@conway/*`; it is itself named under the `@conway` namespace and the CLI package depends on the local workspace package.

Relevant dependencies:

- `openai`: OpenAI-compatible inference client, also used when Conway is presented as OpenAI-compatible through `OPENAI_BASE_URL`.
- `siwe`: SIWE provisioning for Conway API keys.
- `viem`: EVM wallet, signing, RPC, Base chain, ERC-8004, and USDC/x402 flows.
- `@solana/web3.js`: Solana wallet/RPC support.
- `tweetnacl` and `bs58`: Solana signing and key encoding.
- `better-sqlite3`: local state database for identity, children, registry, spend, and inference tables.
- `simple-git`: git operations and self-modification/update workflows.
- `yaml`: heartbeat/config parsing.
- `pnpm-lock.yaml`: locks the current dependency graph and workspace package identity.

## 7. Database Tables And Migration Surface

The current SQLite schema contains several tables that are directly or indirectly tied to Conway or autonomous funding/replication:

- `identity`: stores runtime identity keys such as sandbox and registration status.
- `transactions`: records credit transfers, top-ups, and financial actions.
- `children`: stores child automatons, sandbox IDs, lifecycle state, role, and chain type.
- `registry`: stores ERC-8004 registry entries.
- `reputation`: stores registry feedback.
- `inbox_messages`: stores social relay messages.
- `policy_decisions`: stores authority decisions for financial, x402, transfer, sandbox, and replication tools.
- `spend_tracking`: tracks financial and inference spend windows.
- `inference_costs`: records model usage and cost.
- `model_registry`: stores model listings, including Conway-fetched models.
- `child_lifecycle_events`: tracks child lifecycle transitions.
- `discovered_agents_cache`: caches discovered ERC-8004 agents.
- `onchain_transactions`: tracks chain transaction status.
- `wake_events`, `heartbeat_schedule`, `heartbeat_history`, and `heartbeat_dedup`: can wake the agent for credit, social, child, and model events.

Standalone migration should keep backward-compatible reads initially. Dropping or renaming these tables too early risks losing local state and breaking startup.

## 8. Tools Exposed To The Agent

Conway-related or externally sensitive tools exposed through `src/agent/tools.ts` include:

- Infrastructure: `exec`, `write_file`, `read_file`, `expose_port`, `remove_port`, `create_sandbox`, `delete_sandbox`, `list_sandboxes`, `search_domains`, `register_domain`, `manage_dns`.
- Finance: `check_credits`, `check_usdc_balance`, `topup_credits`, `transfer_credits`, `fund_child`, `check_inference_spending`, `x402_fetch`.
- Communication: `send_message`.
- Inference: `list_models`, `switch_model`.
- Identity/registry: `register_erc8004`, `update_agent_card`, `discover_agents`, `give_feedback`, `check_reputation`.
- Replication: `spawn_child`, `list_children`, `check_child_status`, `start_child`, `message_child`, `verify_child_constitution`, `prune_dead_children`.
- Self-update and external fetch/clone vectors: `review_upstream_changes`, `pull_upstream`, `reset_to_upstream`, `install_skill`, `install_npm_package`, `git_clone`, `git_push`.

Many of these tools are legitimate capabilities, but for a standalone runtime they need explicit local/provider abstractions, user approval boundaries, or opt-in plugins.

## 9. Tests Affected

The following test groups are expected to fail or require rewriting during decoupling:

- Provisioning and identity: `src/__tests__/siws.test.ts`, wallet and chain tests.
- Conway client and HTTP safety: `src/__tests__/http-client.test.ts`, `src/__tests__/mocks.ts`.
- Finance and policy: `src/__tests__/financial.test.ts`, `funding.test.ts`, `spend-tracker.test.ts`, `tools-security.test.ts`, `authority-rules.test.ts`, `policy-engine.test.ts`.
- Social relay and discovery: `src/__tests__/social.test.ts`, `discovery-abi.test.ts`, `discovery-data-uri.test.ts`, `data-layer.test.ts`.
- Replication and lifecycle: `replication.test.ts`, `lifecycle.test.ts`, orchestration and child health tests.
- Inference: `inference-router.test.ts`, `inference/provider-registry.test.ts`, `inference/inference-client.test.ts`, `integration/inference-failover.test.ts`.
- Agent harnesses: `agent/general-harness.test.ts`, `agent/coding-harness.test.ts`, `agent/orchestrator-harness.test.ts`, `agent/base-harness.integration.test.ts`.
- Memory/context tests that encode tool names or financial state: `memory.test.ts`, `context-hardening.test.ts`, `low-compute.test.ts`, `loop.test.ts`.
- Command-injection tests that assert Conway-specific tool execution surfaces remain shell-safe.

## 10. Safe Removal Order

1. Add a standalone/no-contact runtime mode behind configuration and tests before deleting anything.
2. Replace the hard startup requirement for `conwayApiKey` with a provider-neutral capability check.
3. Introduce a `RuntimeControlPlane` interface and adapt local execution separately from Conway sandbox execution.
4. Disable auto-registration, social relay, model refresh, and bootstrap top-up by default unless explicitly configured.
5. Move Conway provisioning (`--provision`, SIWE/SIWS API key creation) behind an optional plugin or remove it after standalone auth exists.
6. Replace inference defaults with explicit BYOK/local provider configuration; remove the implicit Conway-to-OpenAI `OPENAI_BASE_URL` fallback.
7. Isolate x402, credits, USDC top-up, transfer, and paid fetch tools behind explicit opt-in financial providers.
8. Rewrite child spawning to use a configured repository URL, or disable replication until a standalone child bootstrap path exists.
9. Keep database compatibility while marking legacy Conway fields as optional/deprecated.
10. Update tests to prove standalone behavior first, then remove Conway-specific tests or move them to an optional integration suite.
11. Update docs, scripts, package names, CLI aliases, and workflows only after the runtime boundary is proven.
12. Preserve MIT license obligations while removing operational Conway endpoints and branding that are not legally required.

## 11. Risks And Blockers

- Removing `ConwayClient` directly will break startup, tools, heartbeat, tests, and types because it is a central interface.
- Removing `conwayApiKey` before replacing inference configuration can leave the agent unable to make model calls.
- Removing x402/USDC code without disabling financial tools can create broken tool surfaces.
- Leaving default URLs in config after code removal can still cause accidental contact with Conway if fallbacks remain.
- Child spawning currently clones the original repository, so replication must be disabled or re-pointed before any production standalone run.
- Upstream self-update checks can contact the configured `origin`, which might be Conway or the fork depending on deployment.
- Database cleanup can lose child, registry, spend, and transaction state if performed before a migration/compatibility plan.
- Documentation and tests are extensive and may reintroduce Conway endpoints if not updated after code changes.
- Package namespace changes require lockfile and import updates; this must be a deliberate later step, not part of this inventory.

## 12. Zero-Contact Checklist

Use this checklist to prove the project no longer maintains technical contact with Conway after future migration work:

- Static grep finds no `conway.tech`, `api.conway.tech`, `social.conway.tech`, `inference.conway.tech`, or `Conway-Research/automaton` outside license/attribution and migration documentation.
- Static grep finds no runtime imports from `src/conway/*` unless the module is optional and disabled by default.
- Runtime starts without `CONWAY_API_KEY`, `CONWAY_API_URL`, and `CONWAY_SANDBOX_ID`.
- First-run setup does not call provisioning endpoints and does not ask for a Conway API key.
- Default config contains no Conway URLs and no social relay URL unless explicitly entered by the user.
- Agent loop does not set `OPENAI_BASE_URL` to a Conway endpoint.
- Heartbeat does not call Conway credits, model list, social relay, or sandbox health endpoints by default.
- `bootstrapTopup` does not run automatically.
- Agent tools for Conway credits, sandbox, domain/DNS, top-up, transfer, social relay, and x402 are absent or explicitly disabled.
- Child spawning does not clone `Conway-Research/automaton` and does not create Conway sandboxes.
- Tests pass with network denied except for explicitly mocked local endpoints.
- A packet-capture or denylist test confirms no DNS lookups or HTTP/TLS connections to Conway domains during setup, startup, idle heartbeat, one agent turn, and shutdown.
- CI runs a static no-contact check before tests.
- MIT license notices are preserved where required while operational references are removed.

## 13. License References To Preserve

The repository uses the MIT license. During future decoupling:

- Do not delete `LICENSE` unless legal review says otherwise.
- Preserve required copyright and permission notices from upstream source distributions.
- Operational branding, endpoints, package names, install scripts, and runtime defaults are not license obligations and should be separated from legally required attribution.

## 14. Scan Result

- Broad files with direct or indirect Conway-related coupling: `139`.
- Branch at inventory time: `refactor/standalone-runtime`.
- Only file intended to be created by this task: `docs/standalone-migration-inventory.md`.
