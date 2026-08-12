/**
 * Financial policy rules for local inference budgeting.
 */

import type {
  PolicyRule,
  PolicyRequest,
  PolicyRuleResult,
  TreasuryPolicy,
} from "../../types.js";

function deny(
  rule: string,
  reasonCode: string,
  humanMessage: string,
): PolicyRuleResult {
  return { rule, action: "deny", reasonCode, humanMessage };
}

function createInferenceDailyCapRule(policy: TreasuryPolicy): PolicyRule {
  return {
    id: "financial.inference_daily_cap",
    description: `Deny inference if daily cost exceeds ${policy.maxInferenceDailyCents} cents`,
    priority: 500,
    appliesTo: { by: "category", categories: ["conway"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      if (request.tool.name !== "chat" && request.tool.name !== "inference") {
        return null;
      }

      const spendTracker = request.turnContext.sessionSpend;
      const dailyInferenceSpend = spendTracker.getDailySpend("inference");

      if (dailyInferenceSpend >= policy.maxInferenceDailyCents) {
        return deny(
          "financial.inference_daily_cap",
          "INFERENCE_BUDGET_EXCEEDED",
          `Daily inference budget exceeded: ${dailyInferenceSpend} cents spent (max ${policy.maxInferenceDailyCents} cents / $${(policy.maxInferenceDailyCents / 100).toFixed(2)}/day)`,
        );
      }

      return null;
    },
  };
}

export function createFinancialRules(
  treasuryPolicy: TreasuryPolicy,
): PolicyRule[] {
  return [
    createInferenceDailyCapRule(treasuryPolicy),
  ];
}
