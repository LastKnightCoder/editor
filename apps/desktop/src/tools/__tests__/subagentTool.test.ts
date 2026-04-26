import { describe, expect, it } from "vitest";

import { buildSubAgentAgentPolicies } from "@/agent/subagentAgentPolicies";

describe("subagentTool", () => {
  it("timeoutMs 只作用于 SubAgent 内部工具调用，不限制 SubAgent 自身运行", () => {
    const policies = buildSubAgentAgentPolicies({
      maxToolCallLoops: 6,
      toolTimeoutMs: 45000,
    });

    expect(policies.defaultToolTimeoutMs).toBe(45000);
    expect(policies.shouldSkipToolTimeout?.("query_todos")).toBe(false);
    expect(policies.getToolTimeoutMs).toBeUndefined();
  });
});
