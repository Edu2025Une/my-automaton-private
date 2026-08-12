import { SURVIVAL_THRESHOLDS, type SurvivalTier } from "../types.js";

export function getSurvivalTier(creditsCents: number): SurvivalTier {
  if (creditsCents < SURVIVAL_THRESHOLDS.dead) return "dead";
  if (creditsCents <= SURVIVAL_THRESHOLDS.critical) return "critical";
  if (creditsCents <= SURVIVAL_THRESHOLDS.low_compute) return "low_compute";
  if (creditsCents <= SURVIVAL_THRESHOLDS.normal) return "normal";
  return "high";
}

export function formatCredits(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
