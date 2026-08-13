import fs from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createInferenceClient } from "../inference/inference.js";
import {
  buildOpenRouterProviderPayload,
  resolveExplicitStandaloneProvider,
  resolveOpenRouterConfig,
} from "../inference/provider-config.js";
import {
  assertStandaloneInferenceConfigured,
  getIndependentInferenceProvider,
} from "../standalone.js";
import { chatViaOpenRouter } from "../inference/providers/openrouter.js";
import { InferenceRouter } from "../inference/router.js";

const ORIGINAL_ENV = { ...process.env };
const fetchCalls: Array<{ url: string; init: RequestInit }> = [];

function strictOpenRouterEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    INFERENCE_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "test-openrouter-key",
    OPENROUTER_MODEL: "openai/gpt-4.1-mini",
    OPENROUTER_ROUTING_MODE: "strict",
    OPENROUTER_ALLOWED_PROVIDERS: "openai",
    ...overrides,
  };
}

function mockFetch(): void {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "or-response",
        model: "openai/gpt-4.1-mini",
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: "ok",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: "{\"path\":\"relative.md\"}",
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
      text: async () => "mock failure body with no key",
    } as Response;
  }));
}

function lastRequestBody(): any {
  const last = fetchCalls[fetchCalls.length - 1];
  return JSON.parse(String(last.init.body));
}

describe("OpenRouter standalone provider", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fetchCalls.splice(0, fetchCalls.length);
    mockFetch();
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("accepts openrouter as an explicit standalone provider", () => {
    const env = strictOpenRouterEnv();
    expect(resolveExplicitStandaloneProvider(env)).toBe("openrouter");
    expect(getIndependentInferenceProvider({}, env)).toBe("openrouter");
    expect(() => assertStandaloneInferenceConfigured({}, env)).not.toThrow();
  });

  it("requires OPENROUTER_API_KEY without leaking configured values", () => {
    const env = strictOpenRouterEnv({ OPENROUTER_API_KEY: "" });
    expect(() => resolveOpenRouterConfig(env)).toThrow(/Invalid OpenRouter configuration/);
    try {
      resolveOpenRouterConfig(strictOpenRouterEnv({ OPENROUTER_PRESET: "@preset/test" }));
    } catch (error: any) {
      expect(error.message).not.toContain("test-openrouter-key");
    }
  });

  it("uses free when no model or preset is configured", () => {
    const config = resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_MODEL: "",
      OPENROUTER_ALLOWED_PROVIDERS: "openai",
    }));
    expect(config.model).toBe("free");
  });

  it("InferenceRouter selects the explicit model or free without consulting strategy defaults", () => {
    const makeRouter = (defaultModel?: string) => new InferenceRouter(
      {} as any,
      {} as any,
      {} as any,
      { provider: "openrouter", defaultModel },
    );

    expect(makeRouter().selectModel("high", "agent_turn")?.modelId).toBe("free");
    expect(makeRouter("openai/gpt-oss-20b:free").selectModel("high", "agent_turn")?.modelId)
      .toBe("openai/gpt-oss-20b:free");
  });

  it("validates preset format", () => {
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_MODEL: "",
      OPENROUTER_PRESET: "preset/team",
    }))).toThrow(/Invalid OpenRouter configuration/);

    const config = resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_MODEL: "",
      OPENROUTER_PRESET: "@preset/team",
    }));
    expect(config.model).toBe("@preset/team");
  });

  it("uses the default endpoint and rejects unsafe custom base URLs", () => {
    expect(resolveOpenRouterConfig(strictOpenRouterEnv()).baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_BASE_URL: "https://router.example/v1",
    }))).toThrow(/Invalid OpenRouter configuration/);
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_BASE_URL: "https://user:pass@router.example/v1",
      OPENROUTER_ALLOW_CUSTOM_BASE_URL: "true",
    }))).toThrow(/Invalid OpenRouter configuration/);
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_BASE_URL: "http://router.example/v1",
      OPENROUTER_ALLOW_CUSTOM_BASE_URL: "true",
    }))).toThrow(/Invalid OpenRouter configuration/);
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_BASE_URL: "https://api.conway.tech/v1",
      OPENROUTER_ALLOW_CUSTOM_BASE_URL: "true",
    }))).toThrow(/Invalid OpenRouter configuration/);
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_BASE_URL: "https://api.conway.tech.evil.example/v1",
      OPENROUTER_ALLOW_CUSTOM_BASE_URL: "true",
    }))).not.toThrow();
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_BASE_URL: "https://evil.api.conway.tech/v1",
      OPENROUTER_ALLOW_CUSTOM_BASE_URL: "true",
    }))).toThrow(/Invalid OpenRouter configuration/);
  });

  it("sends configured model, tool calls, non-streaming payload, strict routing, and headers", async () => {
    const config = resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_SITE_URL: "https://example.com/app",
      OPENROUTER_APP_NAME: "Automaton Test",
    }));
    const client = createInferenceClient({
      defaultModel: "ignored-local-model",
      maxTokens: 128,
      openRouter: config,
      openaiApiKey: "other-provider-key",
    });

    const result = await client.chat(
      [{ role: "user", content: "hello" }],
      {
        stream: true,
        tools: [{
          type: "function",
          function: {
            name: "read_file",
            description: "Read a file.",
            parameters: { type: "object" },
          },
        }],
      },
    );

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((fetchCalls[0].init.headers as any).Authorization).toBe("Bearer test-openrouter-key");
    expect((fetchCalls[0].init.headers as any)["HTTP-Referer"]).toBe("https://example.com/app");
    expect((fetchCalls[0].init.headers as any)["X-Title"]).toBe("Automaton Test");

    const body = lastRequestBody();
    expect(body.model).toBe("openai/gpt-4.1-mini");
    expect(body.stream).toBe(false);
    expect(body.tools[0].function.name).toBe("read_file");
    expect(body.provider).toEqual({
      only: ["openai"],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
    });
    expect(result.toolCalls?.[0].function.name).toBe("read_file");
  });

  it("sends free when OpenRouter has no model configured", async () => {
    const config = resolveOpenRouterConfig(strictOpenRouterEnv({ OPENROUTER_MODEL: "" }));
    const client = createInferenceClient({ defaultModel: "gpt-5.2", maxTokens: 128, openRouter: config });

    await client.chat([{ role: "user", content: "hello" }]);

    expect(lastRequestBody().model).toBe("free");
    expect(lastRequestBody().model).not.toBe("gpt-5.2");
  });

  it("sends preset as model", async () => {
    const config = resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_MODEL: "",
      OPENROUTER_PRESET: "@preset/safe-default",
    }));
    const client = createInferenceClient({ defaultModel: "ignored", maxTokens: 128, openRouter: config });
    await client.chat([{ role: "user", content: "hello" }]);
    expect(lastRequestBody().model).toBe("@preset/safe-default");
  });

  it("strict mode requires allowed providers, normalizes providers, and validates provider order", () => {
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({ OPENROUTER_ALLOWED_PROVIDERS: "" })))
      .toThrow(/Invalid OpenRouter configuration/);
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({ OPENROUTER_PROVIDER_ORDER: "anthropic" })))
      .toThrow(/Invalid OpenRouter configuration/);
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_ALLOWED_PROVIDERS: "openai,bad\nprovider",
    }))).toThrow(/Invalid OpenRouter configuration/);

    const config = resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_ALLOWED_PROVIDERS: " openai, anthropic, openai ",
      OPENROUTER_PROVIDER_ORDER: " anthropic, openai, anthropic ",
      OPENROUTER_ALLOW_FALLBACKS: "true",
      OPENROUTER_REQUIRE_PARAMETERS: "false",
      OPENROUTER_DATA_COLLECTION: "allow",
      OPENROUTER_ZDR: "false",
    }));
    expect(buildOpenRouterProviderPayload(config.routing)).toEqual({
      only: ["openai", "anthropic"],
      order: ["anthropic", "openai"],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
    });
  });

  it("balanced mode keeps conservative defaults and validates booleans", () => {
    const config = resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_ROUTING_MODE: "balanced",
      OPENROUTER_ALLOWED_PROVIDERS: "",
    }));
    expect(config.routing.allowFallbacks).toBe(false);
    expect(config.routing.requireParameters).toBe(true);
    expect(config.routing.dataCollection).toBe("deny");
    expect(config.routing.zdr).toBe(false);

    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_ROUTING_MODE: "balanced",
      OPENROUTER_ALLOW_FALLBACKS: "yes",
    }))).toThrow(/Invalid OpenRouter configuration/);
  });

  it("optional headers only appear when configured and reject unsafe values", () => {
    expect(resolveOpenRouterConfig(strictOpenRouterEnv()).headers).toEqual({});
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_SITE_URL: "https://user:pass@example.com",
    }))).toThrow(/Invalid OpenRouter configuration/);
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_SITE_URL: "https://example.com/\r\nx",
    }))).toThrow(/Invalid OpenRouter configuration/);
    expect(() => resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_APP_NAME: `bad\nname`,
    }))).toThrow(/Invalid OpenRouter configuration/);
  });

  it("metadata is opaque and excludes prompt, responses, tool args, paths, and secrets", async () => {
    const config = resolveOpenRouterConfig(strictOpenRouterEnv({
      OPENROUTER_TRACE_ENABLED: "true",
      OPENROUTER_TRACE_PROJECT: "standalone",
      OPENROUTER_TRACE_ENVIRONMENT: "test",
    }));
    const client = createInferenceClient({ defaultModel: "ignored", maxTokens: 128, openRouter: config });
    await client.chat(
      [{ role: "user", content: "secret prompt content" }],
      {
        tools: [{
          type: "function",
          function: {
            name: "read_file",
            description: "Read.",
            parameters: { path: "/root/private.txt" },
          },
        }],
      },
    );

    const serialized = JSON.stringify(lastRequestBody().metadata);
    expect(serialized).toContain("trace_id");
    expect(serialized).toContain("session_id");
    expect(serialized).not.toContain("secret prompt content");
    expect(serialized).not.toContain("/root/private.txt");
    expect(serialized).not.toContain("test-openrouter-key");
  });

  it("does not fall back to another provider when OpenRouter is explicit", async () => {
    const config = resolveOpenRouterConfig(strictOpenRouterEnv());
    const client = createInferenceClient({
      defaultModel: "gpt-5.2",
      maxTokens: 128,
      openRouter: config,
      openaiApiKey: "openai-key-that-must-not-be-used",
      anthropicApiKey: "anthropic-key-that-must-not-be-used",
      ollamaBaseUrl: "http://localhost:11434",
    });

    await client.chat([{ role: "user", content: "hello" }], { model: "claude-4" });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain("openrouter.ai");
    expect(lastRequestBody().model).toBe("openai/gpt-4.1-mini");
  });

  it("sanitizes HTTP, non-JSON, timeout, and network errors", async () => {
    const config = resolveOpenRouterConfig(strictOpenRouterEnv());
    const client = createInferenceClient({ defaultModel: "ignored", maxTokens: 128, openRouter: config });
    const secret = "test-openrouter-key";

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: `bad ${secret}` }),
      text: async () => `bad ${secret}`,
    } as Response)));
    await expect(client.chat([{ role: "user", content: "hello" }]))
      .rejects.toThrow("Inference error (openrouter): 401");
    await expect(client.chat([{ role: "user", content: "hello" }]))
      .rejects.not.toThrow(secret);

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error(`not json ${secret}`);
      },
      text: async () => "",
    } as unknown as Response)));
    await expect(client.chat([{ role: "user", content: "hello" }]))
      .rejects.toThrow("Invalid inference response (openrouter)");

    const request = vi.fn(async () => {
      throw new Error(`network ${secret}`);
    });
    await expect(chatViaOpenRouter({
      body: {
        model: "ignored",
        messages: [{ role: "user", content: "hello" }],
      },
      config,
      httpClient: { request } as any,
      timeoutMs: 1234,
    }))
      .rejects.toThrow("Inference request failed (openrouter)");
    expect(request).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({ timeout: 1234 }),
    );
  });

  it("keeps the startup zero-contact Conway audit passing", () => {
    const files = [
      "../index.ts",
      "../config.ts",
      "../standalone.ts",
      "../setup/wizard.ts",
      "../setup/configure.ts",
      "../setup/defaults.ts",
      "../agent/loop.ts",
      "../inference/inference.ts",
    ];
    const forbidden = [
      "api.conway.tech",
      "inference.conway.tech",
      "social.conway.tech",
      "github.com/Conway-Research",
      "OPENAI_BASE_URL",
      "CONWAY_API_KEY",
    ];

    for (const file of files) {
      const source = fs.readFileSync(new URL(file, import.meta.url), "utf-8");
      for (const value of forbidden) {
        expect(source, `${file} contains ${value}`).not.toContain(value);
      }
    }
  });
});
