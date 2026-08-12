import { randomUUID } from "node:crypto";

export type StandaloneProvider = "openai" | "anthropic" | "ollama" | "openrouter";
export type OpenRouterRoutingMode = "strict" | "balanced";
export type OpenRouterDataCollection = "allow" | "deny";

export interface OpenRouterRoutingConfig {
  mode: OpenRouterRoutingMode;
  allowedProviders: string[];
  providerOrder: string[];
  allowFallbacks: boolean;
  requireParameters: boolean;
  dataCollection: OpenRouterDataCollection;
  zdr: boolean;
}

export interface OpenRouterConfig {
  provider: "openrouter";
  apiKey: string;
  model: string;
  baseUrl: string;
  routing: OpenRouterRoutingConfig;
  headers: Record<string, string>;
  trace: {
    enabled: boolean;
    traceId: string;
    sessionId: string;
    project?: string;
    environment?: string;
  };
}

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_PROVIDER_ERROR =
  "Invalid OpenRouter configuration. Check INFERENCE_PROVIDER, OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_PRESET, OPENROUTER_BASE_URL, OPENROUTER_ROUTING_MODE, OPENROUTER_ALLOWED_PROVIDERS, OPENROUTER_PROVIDER_ORDER, and boolean OpenRouter variables.";

const OPENROUTER_BOOLEAN_ENV = [
  "OPENROUTER_ALLOW_CUSTOM_BASE_URL",
  "OPENROUTER_ALLOW_FALLBACKS",
  "OPENROUTER_REQUIRE_PARAMETERS",
  "OPENROUTER_ZDR",
  "OPENROUTER_TRACE_ENABLED",
] as const;

const LEGACY_PROVIDER_DOMAIN = ["conway", "tech"].join(".");
const LEGACY_PROVIDER_HOSTS = [
  ["api", LEGACY_PROVIDER_DOMAIN].join("."),
  ["inference", LEGACY_PROVIDER_DOMAIN].join("."),
  ["social", LEGACY_PROVIDER_DOMAIN].join("."),
  LEGACY_PROVIDER_DOMAIN,
] as const;

export function getOpenRouterProviderError(): string {
  return OPENROUTER_PROVIDER_ERROR;
}

export function resolveExplicitStandaloneProvider(
  env: NodeJS.ProcessEnv = process.env,
): StandaloneProvider | null {
  const value = env.INFERENCE_PROVIDER?.trim().toLowerCase();
  if (!value) return null;
  if (value === "openai" || value === "anthropic" || value === "ollama" || value === "openrouter") {
    return value;
  }
  throw new Error("Invalid INFERENCE_PROVIDER. Use openai, anthropic, ollama, or openrouter.");
}

export function resolveOpenRouterConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterConfig {
  for (const name of OPENROUTER_BOOLEAN_ENV) {
    if (env[name] !== undefined) parseBooleanEnv(name, env[name]);
  }

  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error(OPENROUTER_PROVIDER_ERROR);

  const model = env.OPENROUTER_MODEL?.trim();
  const preset = env.OPENROUTER_PRESET?.trim();
  if ((model && preset) || (!model && !preset)) throw new Error(OPENROUTER_PROVIDER_ERROR);
  if (preset && !/^@preset\/[a-z0-9][a-z0-9._-]*$/i.test(preset)) {
    throw new Error(OPENROUTER_PROVIDER_ERROR);
  }

  const baseUrl = resolveOpenRouterBaseUrl(env);
  const routing = resolveOpenRouterRouting(env);
  const headers = resolveOpenRouterHeaders(env);
  const trace = resolveOpenRouterTrace(env);

  return {
    provider: "openrouter",
    apiKey,
    model: model || preset as string,
    baseUrl,
    routing,
    headers,
    trace,
  };
}

export function buildOpenRouterProviderPayload(
  routing: OpenRouterRoutingConfig,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    allow_fallbacks: routing.allowFallbacks,
    require_parameters: routing.requireParameters,
    data_collection: routing.dataCollection,
    zdr: routing.zdr,
  };

  if (routing.allowedProviders.length > 0) {
    payload.only = routing.allowedProviders;
  }
  if (routing.providerOrder.length > 0) {
    payload.order = routing.providerOrder;
  }

  return payload;
}

export function buildOpenRouterMetadata(
  config: OpenRouterConfig,
): Record<string, string> | undefined {
  if (!config.trace.enabled) return undefined;
  return removeUndefined({
    trace_id: config.trace.traceId,
    session_id: config.trace.sessionId,
    generation: "automaton-standalone-inference",
    task_type: "agent_inference",
    runtime: "automaton",
    runtime_mode: "standalone",
    project: config.trace.project,
    environment: config.trace.environment,
  });
}

function resolveOpenRouterBaseUrl(env: NodeJS.ProcessEnv): string {
  const configured = env.OPENROUTER_BASE_URL?.trim();
  if (!configured) return OPENROUTER_DEFAULT_BASE_URL;
  if (hasControlCharacters(configured)) throw new Error(OPENROUTER_PROVIDER_ERROR);

  if (!parseBooleanEnv("OPENROUTER_ALLOW_CUSTOM_BASE_URL", env.OPENROUTER_ALLOW_CUSTOM_BASE_URL, false)) {
    throw new Error(OPENROUTER_PROVIDER_ERROR);
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(OPENROUTER_PROVIDER_ERROR);
  }

  if (parsed.username || parsed.password) throw new Error(OPENROUTER_PROVIDER_ERROR);
  if (parsed.protocol !== "https:") throw new Error(OPENROUTER_PROVIDER_ERROR);

  parsed.hash = "";
  parsed.search = "";
  const normalized = parsed.href.replace(/\/+$/, "");
  const normalizedHost = new URL(normalized).hostname;
  if (isLegacyProviderHost(normalizedHost)) throw new Error(OPENROUTER_PROVIDER_ERROR);
  return normalized;
}

function isLegacyProviderHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return LEGACY_PROVIDER_HOSTS.some((host) => lower === host || lower.endsWith(`.${host}`));
}

function resolveOpenRouterRouting(env: NodeJS.ProcessEnv): OpenRouterRoutingConfig {
  const modeValue = env.OPENROUTER_ROUTING_MODE?.trim().toLowerCase() || "strict";
  if (modeValue !== "strict" && modeValue !== "balanced") throw new Error(OPENROUTER_PROVIDER_ERROR);

  const allowedProviders = parseCsvEnv(env.OPENROUTER_ALLOWED_PROVIDERS);
  const providerOrder = parseCsvEnv(env.OPENROUTER_PROVIDER_ORDER);

  if (modeValue === "strict") {
    if (allowedProviders.length === 0) throw new Error(OPENROUTER_PROVIDER_ERROR);
    const allowed = new Set(allowedProviders);
    if (providerOrder.some((provider) => !allowed.has(provider))) {
      throw new Error(OPENROUTER_PROVIDER_ERROR);
    }
    return {
      mode: "strict",
      allowedProviders,
      providerOrder,
      allowFallbacks: false,
      requireParameters: true,
      dataCollection: "deny",
      zdr: true,
    };
  }

  return {
    mode: "balanced",
    allowedProviders,
    providerOrder,
    allowFallbacks: parseBooleanEnv("OPENROUTER_ALLOW_FALLBACKS", env.OPENROUTER_ALLOW_FALLBACKS, false),
    requireParameters: parseBooleanEnv("OPENROUTER_REQUIRE_PARAMETERS", env.OPENROUTER_REQUIRE_PARAMETERS, true),
    dataCollection: parseDataCollection(env.OPENROUTER_DATA_COLLECTION),
    zdr: parseBooleanEnv("OPENROUTER_ZDR", env.OPENROUTER_ZDR, true),
  };
}

function resolveOpenRouterHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  const headers: Record<string, string> = {};
  const siteUrl = env.OPENROUTER_SITE_URL?.trim();
  const appName = env.OPENROUTER_APP_NAME?.trim();

  if (siteUrl) {
    if (hasControlCharacters(siteUrl)) throw new Error(OPENROUTER_PROVIDER_ERROR);
    let parsed: URL;
    try {
      parsed = new URL(siteUrl);
    } catch {
      throw new Error(OPENROUTER_PROVIDER_ERROR);
    }
    if (parsed.username || parsed.password) throw new Error(OPENROUTER_PROVIDER_ERROR);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(OPENROUTER_PROVIDER_ERROR);
    }
    headers["HTTP-Referer"] = parsed.href;
  }

  if (appName) {
    if (appName.length > 80 || /[\u0000-\u001f\u007f]/.test(appName)) {
      throw new Error(OPENROUTER_PROVIDER_ERROR);
    }
    headers["X-Title"] = appName;
  }

  return headers;
}

function resolveOpenRouterTrace(env: NodeJS.ProcessEnv): OpenRouterConfig["trace"] {
  const enabled = parseBooleanEnv("OPENROUTER_TRACE_ENABLED", env.OPENROUTER_TRACE_ENABLED, false);
  const project = sanitizeOpaqueEnvValue(env.OPENROUTER_TRACE_PROJECT);
  const environment = sanitizeOpaqueEnvValue(env.OPENROUTER_TRACE_ENVIRONMENT || "development");
  return {
    enabled,
    traceId: randomUUID(),
    sessionId: randomUUID(),
    project,
    environment,
  };
}

function parseBooleanEnv(name: string, value: string | undefined, defaultValue?: boolean): boolean {
  if (value === undefined || value === "") {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(OPENROUTER_PROVIDER_ERROR);
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(OPENROUTER_PROVIDER_ERROR);
}

function parseDataCollection(value: string | undefined): OpenRouterDataCollection {
  if (value === undefined || value === "") return "deny";
  const normalized = value.trim().toLowerCase();
  if (normalized === "allow" || normalized === "deny") return normalized;
  throw new Error(OPENROUTER_PROVIDER_ERROR);
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const parsed: string[] = [];
  for (const rawItem of value.split(",")) {
    if (hasControlCharacters(rawItem)) throw new Error(OPENROUTER_PROVIDER_ERROR);
    const item = rawItem.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    parsed.push(item);
  }
  return parsed;
}

function sanitizeOpaqueEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 80 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error(OPENROUTER_PROVIDER_ERROR);
  }
  return trimmed;
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function removeUndefined(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
