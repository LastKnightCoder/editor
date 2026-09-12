// 知识库详情返回回归：页内下钻层级必须"一次返回退一级"。
// 页头箭头与 router 返回消费器（物理返回/侧滑）走同一条 goUpOneLevel，
// 都不能把路径直接重置回根。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageInstanceProvider } from "../../../router/pageLifecycle";
import type { Navigator } from "../../../router/navigatorTypes";
import type { DocumentItem, DocumentLibrary } from "../../../types";
import { KnowledgeDetailPage } from "../KnowledgeDetailPage";

const queries = vi.hoisted(() => ({
  useDocumentLibraryQuery: vi.fn(),
  useDocumentItemsQuery: vi.fn(),
  useDocumentItemCreate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDocumentItemDelete: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("../queries", () => queries);
vi.mock("../KnowledgePage", () => ({ libGradient: () => "none" }));
vi.mock("../LinkPickerSheet", () => ({ default: () => null }));

function makeItem(
  id: number,
  title: string,
  children: number[],
  parents: number[] = []
): DocumentItem {
  return {
    id,
    title,
    children,
    parents,
    documents: [1],
    refType: "",
    refId: 0,
    contentId: null,
    count: 0,
    createTime: 0,
    updateTime: 1_736_000_000_000,
    tags: [],
  };
}

const library: DocumentLibrary = {
  id: 1,
  title: "CSS 手册",
  descText: "",
  children: [10],
  isTop: false,
  createTime: 0,
  updateTime: 1_736_000_000_000,
  itemCount: 0,
  linkCount: 0,
};

describe("知识库详情 · 逐层返回", () => {
  let root: Root;
  let container: HTMLDivElement;
  let backHandlers: Array<() => boolean | Promise<boolean>>;
  let onBack: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    backHandlers = [];
    onBack = vi.fn();
    const navigator = {
      registerBackHandler: (_entryId: string, handler: () => boolean | Promise<boolean>) => {
        backHandlers.push(handler);
        return () => {
          backHandlers = backHandlers.filter(entry => entry !== handler);
        };
      },
    } as unknown as Navigator;

    queries.useDocumentLibraryQuery.mockReturnValue({ data: library });
    queries.useDocumentItemsQuery.mockReturnValue({
      data: [
        makeItem(10, "背景", [20]),
        makeItem(20, "语法", [30], [10]),
        makeItem(30, "选择器", [], [20]),
      ],
      isLoading: false,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <PageInstanceProvider
          value={{
            entry: {
              id: "entry-1",
              key: "knowledgeDetail",
              params: { libraryId: 1 },
              createdAt: 0,
              lastActiveAt: 0,
            },
            params: { libraryId: 1 },
            navigator,
            phase: "active",
            transition: { seq: 0, type: null },
          }}
        >
          <KnowledgeDetailPage
            libraryId={1}
            onBack={onBack}
            onOpenNodeEditor={vi.fn()}
            onOpenCard={vi.fn()}
            onOpenArticle={vi.fn()}
            onError={vi.fn()}
          />
        </PageInstanceProvider>
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const pathBarText = () =>
    container.querySelector('[aria-label="查看完整结构"]')?.parentElement?.textContent ?? "";

  const drillInto = (title: string) => {
    const titleEl = [...container.querySelectorAll("p")].find(
      element => element.textContent?.trim() === title
    );
    if (!titleEl) {
      throw new Error(`未找到节点：${title}`);
    }
    const row = titleEl.parentElement?.parentElement;
    act(() => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  const clickHeaderBack = () => {
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="返回"]');
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  it("页头返回箭头每次只退一级", () => {
    drillInto("背景");
    expect(pathBarText()).toContain("背景");

    drillInto("语法");
    expect(pathBarText()).toContain("背景");
    expect(pathBarText()).toContain("语法");

    clickHeaderBack();
    expect(pathBarText()).toContain("背景");
    expect(pathBarText()).not.toContain("语法");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("router 返回消费器逐级消费，根层才交还路由弹栈", async () => {
    drillInto("背景");
    drillInto("语法");

    await act(async () => {
      expect(await backHandlers[0]()).toBe(true);
    });
    expect(pathBarText()).toContain("背景");
    expect(pathBarText()).not.toContain("语法");

    await act(async () => {
      expect(await backHandlers[0]()).toBe(true);
    });
    expect(pathBarText()).toContain("CSS 手册");
    expect(pathBarText()).not.toContain("背景");

    await act(async () => {
      expect(await backHandlers[0]()).toBe(false);
    });
    expect(onBack).not.toHaveBeenCalled();
  });
});
