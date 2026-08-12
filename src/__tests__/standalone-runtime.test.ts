import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createConfig } from "../config.js";
import { createInferenceClient } from "../conway/inference.js";
import { DEFAULT_CONFIG } from "../types.js";
import { createBuiltinTools, executeTool, REMOVED_STANDALONE_TOOL_NAMES, toolsToInferenceFormat } from "../agent/tools.js";
import { createTestConfig, createTestIdentity, MockConwayClient, MockInferenceClient } from "./mocks.js";
import {
  assertStandaloneInferenceConfigured,
  disableConwayRuntimeFields,
  getIndependentInferenceProvider,
  getRuntimeMode,
  getStandaloneBootstrapExternalUrls,
  STANDALONE_PROVIDER_ERROR,
} from "../standalone.js";

describe("standalone runtime mode", () => {
  it("defaults runtime mode to standalone", () => {
    expect(DEFAULT_CONFIG.runtimeMode).toBe("standalone");
    expect(getRuntimeMode(null)).toBe("standalone");
    expect(getRuntimeMode({ runtimeMode: "conway" } as any)).toBe("standalone");
  });

  it("converts legacy conway runtime config into standalone-safe config", () => {
    const config = disableConwayRuntimeFields({
      runtimeMode: "conway",
      registeredWithConway: true,
      sandboxId: "legacy-sandbox",
      conwayApiUrl: "https://api.conway.tech",
      conwayApiKey: "cnwy_k_secret",
      socialRelayUrl: "https://social.conway.tech",
    } as any);

    expect(config.runtimeMode).toBe("standalone");
    expect(config.registeredWithConway).toBe(false);
    expect(config.sandboxId).toBe("");
    expect(config.conwayApiUrl).toBe("");
    expect(config.conwayApiKey).toBe("");
    expect((config as any).socialRelayUrl).toBeUndefined();
  });

  it("creates standalone config without Conway credentials or default Conway URLs", () => {
    const config = createConfig({
      name: "local-agent",
      genesisPrompt: "Work locally.",
      creatorAddress: "local://creator",
      openaiApiKey: "test-openai-key",
    });

    expect(config.runtimeMode).toBe("standalone");
    expect(config.conwayApiKey).toBe("");
    expect(config.conwayApiUrl).toBe("");
    expect(config.sandboxId).toBe("");
    expect((config as any).socialRelayUrl).toBeUndefined();
    expect(getStandaloneBootstrapExternalUrls(config)).toEqual([]);
  });

  it("standalone initialization does not require conwayApiKey when an independent provider is configured", () => {
    const config = createConfig({
      name: "local-agent",
      genesisPrompt: "Work locally.",
      creatorAddress: "local://creator",
      openaiApiKey: "test-openai-key",
    });

    expect(config.conwayApiKey).toBe("");
    expect(() => assertStandaloneInferenceConfigured(config, {})).not.toThrow();
    expect(getIndependentInferenceProvider(config, {})).toBe("openai");
  });

  it("rejects standalone bootstrap when no independent inference provider is configured", () => {
    const config = createConfig({
      name: "local-agent",
      genesisPrompt: "Work locally.",
      creatorAddress: "local://creator",
    });

    expect(() => assertStandaloneInferenceConfigured(config, {})).toThrow(STANDALONE_PROVIDER_ERROR);
  });

  it("does not fall back to Conway inference when Conway backend is disabled", async () => {
    const client = createInferenceClient({
      defaultModel: "gpt-5.2",
      maxTokens: 128,
    });

    await expect(client.chat([{ role: "user", content: "hello" }]))
      .rejects
      .toThrow(STANDALONE_PROVIDER_ERROR);
  });

  it("uses only independent provider selection for standalone inference", () => {
    expect(getIndependentInferenceProvider({}, { OPENAI_API_KEY: "set" })).toBe("openai");
    expect(getIndependentInferenceProvider({}, { ANTHROPIC_API_KEY: "set" })).toBe("anthropic");
    expect(getIndependentInferenceProvider({}, { OLLAMA_BASE_URL: "http://localhost:11434" })).toBe("ollama");
    expect(getIndependentInferenceProvider({}, {})).toBeNull();
  });

  it("does not expose removed Conway tools to the model", () => {
    const tools = createBuiltinTools("");
    const toolNames = new Set(tools.map((tool) => tool.name));
    const inferenceToolNames = new Set(
      toolsToInferenceFormat(tools).map((tool) => tool.function.name),
    );

    for (const removedName of REMOVED_STANDALONE_TOOL_NAMES) {
      expect(toolNames.has(removedName)).toBe(false);
      expect(inferenceToolNames.has(removedName)).toBe(false);
    }
  });

  it("does not execute removed Conway tools through the standalone catalog", async () => {
    const tools = createBuiltinTools("");
    const context = {
      identity: createTestIdentity(),
      config: createTestConfig(),
      db: {} as any,
      conway: new MockConwayClient(),
      inference: new MockInferenceClient(),
    };

    for (const removedName of [
      "check_credits",
      "check_usdc_balance",
      "topup_credits",
      "transfer_credits",
      "x402_fetch",
      "send_message",
      "check_social_inbox",
    ]) {
      const result = await executeTool(removedName, {}, tools, context);
      expect(result.error).toBe(`Unknown tool: ${removedName}`);
    }
  });

  it("does not schedule or expose the removed social relay task", () => {
    const tasksSource = fs.readFileSync(new URL("../heartbeat/tasks.ts", import.meta.url), "utf-8");
    const configSource = fs.readFileSync(new URL("../heartbeat/config.ts", import.meta.url), "utf-8");
    const tools = createBuiltinTools("");
    const toolNames = new Set(tools.map((tool) => tool.name));

    expect(tasksSource).not.toContain("check_social_inbox");
    expect(configSource).not.toContain("check_social_inbox");
    expect(toolNames.has("send_message")).toBe(false);
    expect(toolNames.has("check_social_inbox")).toBe(false);
  });

  it("removes the provision command from the CLI entrypoint", () => {
    const source = fs.readFileSync(new URL("../index.ts", import.meta.url), "utf-8");
    expect(source).not.toContain("--provision");
    expect(source).not.toContain("provision(");
  });

  it("startup files do not contain executable Conway host defaults or repository fallbacks", () => {
    const files = [
      "../index.ts",
      "../config.ts",
      "../types.ts",
      "../setup/wizard.ts",
      "../setup/configure.ts",
      "../setup/defaults.ts",
      "../agent/loop.ts",
      "../conway/inference.ts",
      "../heartbeat/tasks.ts",
      "../heartbeat/config.ts",
    ];
    const forbidden = [
      "conway.tech",
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
