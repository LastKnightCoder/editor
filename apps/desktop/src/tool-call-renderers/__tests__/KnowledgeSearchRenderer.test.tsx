import { act } from "react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { toolReadMessages } from "../read.i18n";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { serializeUnknownBlock, serializeUnknownInline } from "@tau/markdown";
import type { ToolCallExecutionState } from "@/types";

const previews = vi.hoisted(() => [] as unknown[]);
const contentIO = vi.hoisted(() => vi.fn());
vi.mock("@/commands/content", () => ({ getContentById: contentIO }));
vi.mock("@/components/ContentEditor", () => ({
  default: ({ initValue, contentId }: { initValue: unknown; contentId?: number }) => {
    previews.push(initValue);
    return <div data-preview-kind={contentId === undefined ? "snapshot" : "detail"} />;
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

it("换语保留展开列表、搜索快照与详情目标，不重复读取或重新构造编辑器初值", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  const t = desktopI18n.get(toolReadMessages).t;
  previews.length = 0;
  contentIO.mockReset();
  const content = [{ type: "paragraph", children: [{ text: "原始详情正文" }] }];
  contentIO.mockResolvedValue({ content });
  const results = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    contentId: index + 100,
    type: "card",
    typeName: "工具原始类型名",
    title: `原始结果标题${index}`,
    content: `# 原始快照${index}`,
    updateTime: 1,
    source: "fts",
  }));
  const execution = {
    toolCallId: "search-stable",
    toolName: "search_knowledge",
    status: "success",
    input: "original input",
    timestamp: 1,
    output: JSON.stringify({
      success: true,
      count: results.length,
      message: "工具原始说明",
      results,
    }),
  } as ToolCallExecutionState;
  const originalOutput = execution.output;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props = { execution, parsedInput: {}, isDark: false, renderDefault: () => null };
  try {
    await act(async () => root.render(<KnowledgeSearchRenderer {...props} />));
    const expand = [...container.querySelectorAll("button")].find(
      button => button.textContent === t("read.more", { count: 1 })
    );
    if (!expand) throw new Error("Missing expand action");
    await act(async () => expand.click());
    const title = [...container.querySelectorAll("div")].find(
      element => element.textContent === results[5].title
    );
    if (!title) throw new Error("Expanded result missing");
    await act(async () => title.click());
    const detail = document.querySelector('[data-preview-kind="detail"]');
    expect(detail).not.toBeNull();
    const snapshots = [...container.querySelectorAll('[data-preview-kind="snapshot"]')];
    const initialValues = new Set(previews);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector('[data-preview-kind="detail"]')).toBe(detail);
      expect([...container.querySelectorAll('[data-preview-kind="snapshot"]')]).toEqual(snapshots);
      expect(new Set(previews)).toEqual(initialValues);
      expect(contentIO).toHaveBeenCalledExactlyOnceWith(results[5].contentId);
      expect(container.textContent).toContain("工具原始说明");
      expect(container.textContent).toContain("工具原始类型名");
      expect(execution.output).toBe(originalOutput);
      expect(execution.input).toBe("original input");
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    desktopLocaleSource.setLocale(originalLocale);
  }
});
