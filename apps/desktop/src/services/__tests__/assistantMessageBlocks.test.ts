import { describe, expect, it } from "vitest";

import { Role } from "@/constants";
import type { RequestMessage } from "@/types";
import { limitHistoryMessageGroups } from "../assistantMessageBlocks";

const createTextMessage = (
  role: Role,
  text: string,
  extra?: Partial<RequestMessage>,
): RequestMessage => ({
  role,
  content: [{ type: "text", text }],
  ...extra,
});

describe("limitHistoryMessageGroups", () => {
  it("按组截断历史，避免切断 assistant/tool 调用链", () => {
    const firstToolCall: RequestMessage = {
      role: Role.Assistant,
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "moveToPosition",
            arguments: '{"x":28,"y":23}',
          },
        },
      ],
    };
    const firstToolResult = createTextMessage(Role.Tool, "Move to (28, 23)", {
      tool_call_id: "call-1",
      name: "moveToPosition",
    });
    const secondToolCall: RequestMessage = {
      role: Role.Assistant,
      content: "",
      tool_calls: [
        {
          id: "call-2",
          type: "function",
          function: {
            name: "moveToPosition",
            arguments: '{"x":36,"y":13}',
          },
        },
      ],
    };
    const secondToolResult = createTextMessage(Role.Tool, "Move to (36, 13)", {
      tool_call_id: "call-2",
      name: "moveToPosition",
    });

    const groups: RequestMessage[][] = [
      [createTextMessage(Role.User, "旧问题")],
      [firstToolCall, firstToolResult],
      [createTextMessage(Role.Assistant, "第一次移动完成")],
      [createTextMessage(Role.User, "新问题")],
      [secondToolCall, secondToolResult],
      [createTextMessage(Role.Assistant, "第二次移动完成")],
    ];

    const result = limitHistoryMessageGroups(groups, 5);

    expect(result).toEqual([
      createTextMessage(Role.Assistant, "第一次移动完成"),
      createTextMessage(Role.User, "新问题"),
      secondToolCall,
      secondToolResult,
      createTextMessage(Role.Assistant, "第二次移动完成"),
    ]);
  });

  it("即使单组超过限制，也保留完整工具调用组", () => {
    const toolCallMessage: RequestMessage = {
      role: Role.Assistant,
      content: "",
      tool_calls: [
        {
          id: "call-3",
          type: "function",
          function: {
            name: "getCurrentSpace",
            arguments: "{}",
          },
        },
      ],
    };
    const toolResultMessage = createTextMessage(
      Role.Tool,
      "TestMCP (space-1)",
      {
        tool_call_id: "call-3",
        name: "getCurrentSpace",
      },
    );

    const result = limitHistoryMessageGroups(
      [[toolCallMessage, toolResultMessage]],
      1,
    );

    expect(result).toEqual([toolCallMessage, toolResultMessage]);
  });
});
