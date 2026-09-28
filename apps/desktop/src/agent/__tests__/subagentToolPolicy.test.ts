import { describe, expect, it } from "vitest";

import { isAllowedSubAgentToolName } from "../subagentToolPolicy";

describe("subagentToolPolicy", () => {
  it("允许 SubAgent 使用读写工具，仅阻止递归创建 SubAgent", () => {
    expect(isAllowedSubAgentToolName("query_todos")).toBe(true);
    expect(isAllowedSubAgentToolName("create_todo")).toBe(true);
    expect(isAllowedSubAgentToolName("update_todo")).toBe(true);
    expect(isAllowedSubAgentToolName("delete_todo")).toBe(true);
    expect(isAllowedSubAgentToolName("sync_todo_item_to_calendar")).toBe(true);
    expect(isAllowedSubAgentToolName("subagent_research")).toBe(false);
    // 大小写不敏感
    expect(isAllowedSubAgentToolName("  SUBAGENT_RESEARCH ")).toBe(false);
  });
});
