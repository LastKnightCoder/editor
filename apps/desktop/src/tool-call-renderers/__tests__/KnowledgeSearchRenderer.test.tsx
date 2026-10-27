import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { serializeUnknownBlock, serializeUnknownInline } from "@tau/markdown";
import type { ToolCallExecutionState } from "@/types";

const previews = vi.hoisted(() => [] as unknown[]);
vi.mock("@/components/ContentEditor", () => ({
  default: ({ initValue }: { initValue: unknown }) => {
    previews.push(initValue);
    return null;
  },
}));
vi.mock("@/services/editorKit", () => ({ getContentKit: () => ({}) }));

import KnowledgeSearchRenderer from "../KnowledgeSearchRenderer";

const payload = (node: Record<string, unknown>) => ({
  type: "tau.contract-payload",
  children: [],
  format: 1,
  node,
  contracts: {},
});

it("索引快照里的无损载荷还原为原节点再预览", async () => {
  const link = {
    type: "content-link",
    contentId: 1320,
    children: [{ type: "formatted", text: "卡片" }],
  };
  const list = {
    type: "project-card-list",
    children: [{ type: "formatted", text: "" }],
  };
  const content = [
    `整理为${serializeUnknownInline(payload(link))}。`,
    serializeUnknownBlock(payload(list)),
  ].join("\n\n");
  const execution = {
    toolCallId: "search-1",
    toolName: "search_knowledge",
    status: "success",
    input: "{}",
    timestamp: Date.now(),
    output: JSON.stringify({
      success: true,
      count: 1,
      results: [
        {
          id: 312,
          contentId: 1328,
          type: "diary-moment",
          typeName: "日记",
          title: "日记",
          content,
          updateTime: Date.now(),
          source: "fts",
        },
      ],
    }),
  } as ToolCallExecutionState;
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <KnowledgeSearchRenderer
        execution={execution}
        parsedInput={{}}
        isDark={false}
        renderDefault={() => null}
      />
    );
  });
  const preview = JSON.stringify(previews.at(-1));
  expect(preview).not.toContain("tau.contract-payload");
  expect(previews.at(-1)).toMatchObject([
    { type: "paragraph", children: [{ text: "整理为" }, link, { text: "。" }] },
    list,
  ]);
  act(() => root.unmount());
});
