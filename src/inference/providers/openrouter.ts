import type { InferenceResponse } from "../../types.js";
import type { OpenRouterConfig } from "../provider-config.js";
import {
  buildOpenRouterMetadata,
  buildOpenRouterProviderPayload,
} from "../provider-config.js";
import { chatViaOpenAiCompatible } from "./openai-compatible.js";
import { ResilientHttpClient } from "../../infrastructure/http/resilient-http-client.js";

export interface OpenRouterChatParams {
  body: Record<string, unknown>;
  config: OpenRouterConfig;
  httpClient: ResilientHttpClient;
  timeoutMs: number;
}

export async function chatViaOpenRouter(
  params: OpenRouterChatParams,
): Promise<InferenceResponse> {
  const body = {
    ...params.body,
    model: params.config.model,
    stream: false,
    provider: buildOpenRouterProviderPayload(params.config.routing),
  };

  const metadata = buildOpenRouterMetadata(params.config);
  if (metadata) {
    (body as Record<string, unknown>).metadata = metadata;
  }

  return chatViaOpenAiCompatible({
    model: params.config.model,
    body,
    apiUrl: params.config.baseUrl,
    apiKey: params.config.apiKey,
    backend: "openrouter",
    httpClient: params.httpClient,
    headers: params.config.headers,
    timeoutMs: params.timeoutMs,
  });
}
