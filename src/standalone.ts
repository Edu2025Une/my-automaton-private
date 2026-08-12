import type {
  AutomatonConfig,
  ConwayClient,
  CreateSandboxOptions,
  DomainRegistration,
  DomainSearchResult,
  DnsRecord,
  ExecResult,
  ModelInfo,
  PortInfo,
  RuntimeMode,
  SandboxInfo,
} from "./types.js";
import {
  resolveExplicitStandaloneProvider,
  resolveOpenRouterConfig,
} from "./inference/provider-config.js";

const LEGACY_PROVIDER_DOMAIN = ["conway", "tech"].join(".");

export const CONWAY_HOST_PATTERNS = [
  ["api", LEGACY_PROVIDER_DOMAIN].join("."),
  ["inference", LEGACY_PROVIDER_DOMAIN].join("."),
  ["social", LEGACY_PROVIDER_DOMAIN].join("."),
  LEGACY_PROVIDER_DOMAIN,
] as const;

export const STANDALONE_PROVIDER_ERROR =
  "Standalone runtime requires an independent inference provider. Configure OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_BASE_URL, or INFERENCE_PROVIDER=openrouter with OPENROUTER_API_KEY and exactly one of OPENROUTER_MODEL or OPENROUTER_PRESET.";

export function getRuntimeMode(config?: Partial<AutomatonConfig> | null): RuntimeMode {
  return "standalone";
}

export function isStandaloneRuntime(config?: Partial<AutomatonConfig> | null): boolean {
  return true;
}

export function hadLegacyConwayMode(config?: Partial<AutomatonConfig> | null): boolean {
  return (config as { runtimeMode?: unknown } | null | undefined)?.runtimeMode === "conway";
}

export function disableConwayRuntimeFields<T extends Partial<AutomatonConfig>>(config: T): T {
  const { socialRelayUrl: _legacySocialRelayUrl, ...rest } =
    config as T & { socialRelayUrl?: unknown };
  return {
    ...rest,
    runtimeMode: "standalone",
    registeredWithConway: false,
    sandboxId: "",
    conwayApiUrl: "",
    conwayApiKey: "",
  } as T;
}

export function getIndependentInferenceProvider(
  config: Partial<AutomatonConfig>,
  env: NodeJS.ProcessEnv = process.env,
): "openai" | "anthropic" | "ollama" | "openrouter" | null {
  const explicit = resolveExplicitStandaloneProvider(env);
  if (explicit === "openrouter") {
    resolveOpenRouterConfig(env);
    return "openrouter";
  }
  if (explicit === "openai") {
    if (!env.OPENAI_API_KEY && !config.openaiApiKey) throw new Error(STANDALONE_PROVIDER_ERROR);
    return "openai";
  }
  if (explicit === "anthropic") {
    if (!env.ANTHROPIC_API_KEY && !config.anthropicApiKey) throw new Error(STANDALONE_PROVIDER_ERROR);
    return "anthropic";
  }
  if (explicit === "ollama") {
    if (!env.OLLAMA_BASE_URL && !config.ollamaBaseUrl) throw new Error(STANDALONE_PROVIDER_ERROR);
    return "ollama";
  }
  if (env.OPENAI_API_KEY || config.openaiApiKey) return "openai";
  if (env.ANTHROPIC_API_KEY || config.anthropicApiKey) return "anthropic";
  if (env.OLLAMA_BASE_URL || config.ollamaBaseUrl) return "ollama";
  return null;
}

export function assertStandaloneInferenceConfigured(
  config: Partial<AutomatonConfig>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!getIndependentInferenceProvider(config, env)) {
    throw new Error(STANDALONE_PROVIDER_ERROR);
  }
}

export function containsConwayUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const lower = value.toLowerCase();
  return CONWAY_HOST_PATTERNS.some((host) => lower.includes(host));
}

export function getStandaloneBootstrapExternalUrls(
  config: Partial<AutomatonConfig>,
): string[] {
  const candidates = [
    config.conwayApiUrl,
  ];
  return candidates.filter((value): value is string => containsConwayUrl(value));
}

export function createStandaloneConwayClient(): ConwayClient {
  const disabled = async (): Promise<never> => {
    throw new Error("Conway control-plane operations are disabled in standalone runtime mode.");
  };

  return {
    exec: async (): Promise<ExecResult> => ({
      stdout: "",
      stderr: "Conway sandbox exec is disabled in standalone runtime mode.",
      exitCode: 1,
    }),
    writeFile: async () => disabled(),
    readFile: async () => disabled(),
    exposePort: async (_port: number): Promise<PortInfo> => disabled(),
    removePort: async () => disabled(),
    createSandbox: async (_options: CreateSandboxOptions): Promise<SandboxInfo> => disabled(),
    deleteSandbox: async () => disabled(),
    listSandboxes: async (): Promise<SandboxInfo[]> => disabled(),
    searchDomains: async (): Promise<DomainSearchResult[]> => disabled(),
    registerDomain: async (_domain: string): Promise<DomainRegistration> => disabled(),
    listDnsRecords: async (): Promise<DnsRecord[]> => disabled(),
    addDnsRecord: async (): Promise<DnsRecord> => disabled(),
    deleteDnsRecord: async () => disabled(),
    listModels: async (): Promise<ModelInfo[]> => disabled(),
    registerAutomaton: async () => disabled(),
    createScopedClient: () => createStandaloneConwayClient(),
  };
}
