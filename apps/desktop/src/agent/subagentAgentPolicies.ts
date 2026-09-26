import type { AgentPolicies } from "@tau/agent";
import { createToolPermissionPolicies } from "@/services/tool-permission/policy";

export const buildSubAgentAgentPolicies = ({
  maxToolCallLoops,
  toolTimeoutMs,
}: {
  maxToolCallLoops: number;
  toolTimeoutMs: number;
}): AgentPolicies => ({
  // 子代理没有确认界面：需要确认的工具直接拒绝（跳过确认模式下照常执行）
  ...createToolPermissionPolicies({ interactive: false }),
  maxToolCallLoops,
  maxToolRetries: 1,
  defaultToolTimeoutMs: toolTimeoutMs,
  shouldSkipToolTimeout: () => false,
});
