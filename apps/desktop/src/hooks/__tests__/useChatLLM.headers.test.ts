import { describe, expect, it, vi } from "vitest";

vi.mock("@/tools", () => ({
  __esModule: true,
  default: {
    getToolSchemas: vi.fn(() => []),
    getRegisteredTools: vi.fn(() => []),
    getScopedTools: vi.fn(() => []),
    executeToolCall: vi.fn(),
  },
  ensureToolingReady: vi.fn(),
}));

vi.mock("@/tools/toolRuntimePolicy", () => ({
  filterConflictingToolSchemas: vi.fn(schemas => schemas),
  shouldSkipToolTimeout: vi.fn(() => false),
  getToolExecutionTimeout: vi.fn((toolName: string, defaultTimeout: number) =>
    toolName === "generate_image" ? 300000 : defaultTimeout
  ),
}));

import { createDesktopAgentPolicies, shouldSkipDesktopToolTimeout } from "../useChatLLM";

// 协议适配用例（User-Agent/K3/Responses/Claude cache 等）随旧 adapter 一起退役（M2-f 批次 D 删除），
// 此处仅保留仍被带工具路径引用的工具超时策略契约。
describe("hooks/useChatLLM 工具超时策略", () => {
  it("SubAgent 工具应跳过父 Agent 通用工具超时", () => {
    expect(shouldSkipDesktopToolTimeout("subagent_research")).toBe(true);
    expect(shouldSkipDesktopToolTimeout("query_todos")).toBe(false);
  });

  it("应将工具级超时策略注入 Agent policies", () => {
    const policies = createDesktopAgentPolicies();

    expect(policies.defaultToolTimeoutMs).toBe(30000);
    expect(policies.getToolTimeoutMs?.("generate_image", 30000)).toBe(300000);
    expect(policies.getToolTimeoutMs?.("lookup", 30000)).toBe(30000);
  });
});
