import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createInferenceClient } from "../inference/inference.js";
import {
  resolveExplicitStandaloneProvider,
  resolveGroqConfig,
} from "../inference/provider-config.js";
import { getIndependentInferenceProvider } from "../standalone.js";

const ORIGINAL_ENV = { ...process.env };

describe("Groq standalone provider", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("selects Groq explicitly and uses its default model", () => {
    const env = { INFERENCE_PROVIDER: "groq", GROQ_API_KEY: "test-groq-key" };

    expect(resolveExplicitStandaloneProvider(env)).toBe("groq");
    expect(getIndependentInferenceProvider({}, env)).toBe("groq");
    expect(resolveGroqConfig(env)).toMatchObject({
      provider: "groq",
      model: "llama-3.1-8b-instant",
      baseUrl: "https://api.groq.com/openai/v1",
    });
  });

  it("uses GROQ_MODEL and sends a local OpenAI-compatible request", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "groq-response",
        model: "openai/gpt-oss-20b",
        choices: [{
          finish_reason: "stop",
          message: { role: "assistant", content: "ok" },
        }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    const config = resolveGroqConfig({
      INFERENCE_PROVIDER: "groq",
      GROQ_API_KEY: "test-groq-key",
      GROQ_MODEL: "openai/gpt-oss-20b",
    });
    const client = createInferenceClient({
      defaultModel: "ignored-model",
      maxTokens: 128,
      groq: config,
    });

    await expect(client.chat([{ role: "user", content: "hello" }])).resolves.toMatchObject({
      message: { content: "ok" },
      model: "openai/gpt-oss-20b",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-groq-key");
    expect(JSON.parse(String(init.body)).model).toBe("openai/gpt-oss-20b");
  });

  it("rejects missing API keys without exposing values", () => {
    expect(() => resolveGroqConfig({ INFERENCE_PROVIDER: "groq" })).toThrow(/GROQ_API_KEY/);
  });
});
