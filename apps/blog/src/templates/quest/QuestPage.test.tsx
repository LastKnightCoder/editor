import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QuestPage from "./QuestPage";
import { mockQuestMultiAnswerPageData, mockQuestPageData } from "@blog/mock/data";

vi.mock("@blog/components/Layout", () => ({
  Header: ({ title }: { title: string }) => <header>{title}</header>,
}));

vi.mock("@blog/components/Layout/DocCollectionsMenu", () => ({
  default: () => null,
}));

vi.mock("@blog/components/Common", () => ({
  Tag: ({ name }: { name: string }) => <span>{name}</span>,
  ScrollToTop: () => null,
}));

vi.mock("@tau/editor", () => ({
  Editor: ({ initValue }: { initValue: any[] }) => (
    <div data-testid="editor">
      {JSON.stringify(initValue)
        .replace(/\\u003c/g, "<")
        .replace(/\\u003e/g, ">")}
    </div>
  ),
  EditorProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@blog/components/DndProvider", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@blog/editorExtensions", () => ({
  createBlogEditorExtensions: () => [],
}));

vi.mock("@blog/services/editorRegistry", () => ({
  createBlogEditorRegistry: () => ({}),
}));

describe("QuestPage", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalActEnvironment = (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    window._INIT_DATA_ = mockQuestPageData;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    vi.restoreAllMocks();
  });

  it("应渲染求索录题目、状态和内嵌答案", async () => {
    await act(async () => {
      root.render(<QuestPage />);
    });

    expect(container.textContent).toContain("React 列表重渲染时，为什么输入框会失焦？");
    expect(container.textContent).toContain("已解决");
    expect(container.querySelector('[data-answer-index="01"]')).toBeNull();
    expect(container.textContent).toContain("问");
    expect(container.querySelector('[data-testid="quest-description"]')).not.toBeNull();
    expect(container.textContent).toContain("每输入一个字符，输入框都会失焦");
    expect(container.textContent).toContain("解");
    expect(container.textContent).not.toContain("解 · 其一");
    expect(container.textContent).not.toContain("答案 1");
    expect(container.textContent).toContain("先看 key 是否来自数组下标");
  });

  it("多答案时应显示并列的解题签", async () => {
    window._INIT_DATA_ = mockQuestMultiAnswerPageData;

    await act(async () => {
      root.render(<QuestPage />);
    });

    expect(container.querySelector('[data-answer-index="01"]')).not.toBeNull();
    expect(container.querySelector('[data-answer-index="02"]')).not.toBeNull();
    expect(container.querySelector('[data-answer-index="03"]')).not.toBeNull();
    expect(container.textContent).toContain("解 · 其一");
    expect(container.textContent).toContain("解 · 其二");
    expect(container.textContent).toContain("解 · 其三");
    expect(container.textContent).not.toContain("答案 1");
    expect(container.textContent).toContain("原文");
  });

  it("description 为空时不应渲染补充说明", async () => {
    window._INIT_DATA_ = {
      ...mockQuestPageData,
      content: {
        ...mockQuestPageData.content,
        description: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
        ],
      },
    };

    await act(async () => {
      root.render(<QuestPage />);
    });

    expect(container.querySelector('[data-testid="quest-description"]')).toBeNull();
    expect(container.textContent).not.toContain("每输入一个字符，输入框都会失焦");
  });

  it("应通过已发布来源页面复用答案正文", async () => {
    const remoteContent = [
      {
        type: "paragraph",
        children: [{ text: "这是来自已发布文章的答案正文" }],
      },
    ];
    const remoteInitData = {
      ...mockQuestPageData,
      content: {
        ...mockQuestPageData.content,
        content: remoteContent,
      },
    };
    window._INIT_DATA_ = {
      ...mockQuestPageData,
      content: {
        ...mockQuestPageData.content,
        answers: [
          {
            id: 202,
            createTime: Date.now() - 1000,
            updateTime: Date.now(),
            source: {
              type: "article",
              id: 12,
              contentId: 202,
              href: "/articles/12.html",
              title: "已发布文章",
              published: true,
            },
          },
        ],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        text: () =>
          Promise.resolve(
            `<script>window._INIT_DATA_ = ${JSON.stringify(remoteInitData)};</script>`
          ),
      })
    );

    await act(async () => {
      root.render(<QuestPage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith("/articles/12.html");
    expect(container.textContent).toContain("这是来自已发布文章的答案正文");
  });
});
