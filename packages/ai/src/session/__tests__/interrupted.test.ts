import { expect, it } from "vitest";
import { appendSessionEntries, createSessionFile, projectSessionMessages } from "../index";

it("纯读取历史也把无回执工具投影为结果未知，不永久显示执行中且不改写原始记录", () => {
  const document = appendSessionEntries(createSessionFile({ id: "interrupted" }), [
    { type: "message", message: { role: "user", content: "修改卡片", timestamp: 1 } },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "pending", name: "edit_card", arguments: { id: 1 } }],
        timestamp: 2,
      },
    },
  ]);
  expect(projectSessionMessages(document)[1]).toMatchObject({
    assistant_blocks: [
      expect.objectContaining({
        execution: expect.objectContaining({
          status: "failed",
          metadata: { outcomeUnknown: true },
        }),
      }),
    ],
  });
  expect(document.entries).toHaveLength(2);
});
