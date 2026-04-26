import { describe, expect, it } from "vitest";
import type { AgentTool } from "@tau/agent";

import {
  filterSubAgentTools,
  isAllowedSubAgentToolName,
} from "../subagentToolPolicy";

const createTool = (name: string): AgentTool => ({
  name,
  description: name,
  source: "test",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  async execute() {
    return { content: "ok" };
  },
});

describe("subagentToolPolicy", () => {
  it("允许 SubAgent 使用读写工具，仅阻止递归创建 SubAgent", () => {
    expect(isAllowedSubAgentToolName("query_todos")).toBe(true);
    expect(isAllowedSubAgentToolName("create_todo")).toBe(true);
    expect(isAllowedSubAgentToolName("update_todo")).toBe(true);
    expect(isAllowedSubAgentToolName("delete_todo")).toBe(true);
    expect(isAllowedSubAgentToolName("sync_todo_item_to_calendar")).toBe(true);
    expect(isAllowedSubAgentToolName("subagent_research")).toBe(false);
  });

  it("过滤工具列表时保留顺序并只剔除 subagent_research", () => {
    const tools = [
      createTool("query_todos"),
      createTool("create_todo"),
      createTool("get_calendar_detail"),
      createTool("subagent_research"),
      createTool("delete_calendar"),
    ];

    expect(filterSubAgentTools(tools).map((tool) => tool.name)).toEqual([
      "query_todos",
      "create_todo",
      "get_calendar_detail",
      "delete_calendar",
    ]);
  });
});
