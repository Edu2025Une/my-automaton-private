/**
 * Local budget policy tests.
 *
 * The legacy Conway credit, top-up, transfer and x402 rules were removed.
 * The remaining financial policy surface protects independent inference spend.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import { createFinancialRules } from "../agent/policy-rules/financial.js";
import { PolicyEngine } from "../agent/policy-engine.js";
import type {
  AutomatonTool,
  PolicyRequest,
  PolicyRule,
  SpendCategory,
  SpendTrackerInterface,
  ToolContext,
} from "../types.js";
import { DEFAULT_TREASURY_POLICY } from "../types.js";

function createTestDb(): Database.Database {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-policy-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_decisions (
      id TEXT PRIMARY KEY,
      turn_id TEXT,
      tool_name TEXT NOT NULL,
      tool_args_hash TEXT NOT NULL,
      risk_level TEXT NOT NULL CHECK(risk_level IN ('safe','caution','dangerous','forbidden')),
      decision TEXT NOT NULL CHECK(decision IN ('allow','deny','quarantine')),
      rules_evaluated TEXT NOT NULL DEFAULT '[]',
      rules_triggered TEXT NOT NULL DEFAULT '[]',
      reason TEXT NOT NULL DEFAULT '',
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function createInferenceTool(): AutomatonTool {
  return {
    name: "inference",
    description: "Run an independent inference provider",
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
    riskLevel: "safe",
    category: "conway",
  };
}

function createRequest(
  tool: AutomatonTool,
  spendTracker: SpendTrackerInterface,
): PolicyRequest {
  return {
    tool,
    args: {},
    context: {} as ToolContext,
    turnContext: {
      inputSource: "agent",
      turnToolCallCount: 0,
      sessionSpend: spendTracker,
    },
  };
}

function createMockSpendTracker(dailyInferenceSpend: number): SpendTrackerInterface {
  return {
    recordSpend: () => {},
    getHourlySpend: () => 0,
    getDailySpend: (category: SpendCategory) =>
      category === "inference" ? dailyInferenceSpend : 0,
    getTotalSpend: () => 0,
    checkLimit: () => ({
      allowed: true,
      currentHourlySpend: 0,
      currentDailySpend: dailyInferenceSpend,
      limitHourly: Math.ceil(DEFAULT_TREASURY_POLICY.maxInferenceDailyCents / 6),
      limitDaily: DEFAULT_TREASURY_POLICY.maxInferenceDailyCents,
    }),
    pruneOldRecords: () => 0,
  };
}

describe("local inference budget policy", () => {
  let db: Database.Database;
  let rules: PolicyRule[];
  let engine: PolicyEngine;

  beforeEach(() => {
    db = createTestDb();
    rules = createFinancialRules(DEFAULT_TREASURY_POLICY);
    engine = new PolicyEngine(db, rules);
  });

  afterEach(() => {
    db.close();
  });

  it("registers only the inference daily cap rule", () => {
    expect(rules.map((rule) => rule.id)).toEqual([
      "financial.inference_daily_cap",
    ]);
  });

  it("allows independent inference below the daily budget", () => {
    const decision = engine.evaluate(
      createRequest(createInferenceTool(), createMockSpendTracker(1000)),
    );

    expect(decision.action).toBe("allow");
  });

  it("denies independent inference when the daily budget is exhausted", () => {
    const decision = engine.evaluate(
      createRequest(
        createInferenceTool(),
        createMockSpendTracker(DEFAULT_TREASURY_POLICY.maxInferenceDailyCents),
      ),
    );

    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("INFERENCE_BUDGET_EXCEEDED");
  });
});

describe("treasury defaults", () => {
  it("keeps generic local budget fields and no x402 allowlist", () => {
    expect(DEFAULT_TREASURY_POLICY.maxSingleTransferCents).toBe(5000);
    expect(DEFAULT_TREASURY_POLICY.maxHourlyTransferCents).toBe(10000);
    expect(DEFAULT_TREASURY_POLICY.maxDailyTransferCents).toBe(25000);
    expect(DEFAULT_TREASURY_POLICY.minimumReserveCents).toBe(1000);
    expect(DEFAULT_TREASURY_POLICY.transferCooldownMs).toBe(0);
    expect(DEFAULT_TREASURY_POLICY.maxTransfersPerTurn).toBe(2);
    expect(DEFAULT_TREASURY_POLICY.maxInferenceDailyCents).toBe(50000);
    expect(DEFAULT_TREASURY_POLICY.requireConfirmationAboveCents).toBe(1000);
    expect(DEFAULT_TREASURY_POLICY).not.toHaveProperty("x402AllowedDomains");
    expect(DEFAULT_TREASURY_POLICY).not.toHaveProperty("maxX402PaymentCents");
  });

  it("has finite non-negative numeric defaults", () => {
    for (const value of Object.values(DEFAULT_TREASURY_POLICY)) {
      expect(typeof value).toBe("number");
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});
