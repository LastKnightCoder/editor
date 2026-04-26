import type { AgentPolicies } from "@tau/agent";

export const buildSubAgentAgentPolicies = ({
  maxToolCallLoops,
  toolTimeoutMs,
}: {
  maxToolCallLoops: number;
  toolTimeoutMs: number;
}): AgentPolicies => ({
  maxToolCallLoops,
  maxToolRetries: 1,
  defaultToolTimeoutMs: toolTimeoutMs,
  shouldSkipToolTimeout: () => false,
});
