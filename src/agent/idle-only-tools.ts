const IDLE_ONLY_TOOL_NAMES = [
  "system_synopsis",
  "review_memory",
  "list_models",
  "list_skills",
  "git_status",
  "git_log",
  "check_reputation",
  "recall_facts",
  "recall_procedure",
  "heartbeat_ping",
  "check_inference_spending",
  "orchestrator_status",
  "list_goals",
  "get_plan",
] as const;

export const IDLE_ONLY_TOOLS = new Set<string>(IDLE_ONLY_TOOL_NAMES);

export function isIdleOnlyTool(name: string): boolean {
  return IDLE_ONLY_TOOLS.has(name);
}
