// 项目详情按层级分页：当前层由 itemId 决定，面包屑由节点链推出；进入子层 / 跳回祖先经宿主回调交给路由。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectItem } from "../../../types";

const node = (id: number, title: string, children: number[], parents: number[]): ProjectItem => ({
  id,
  title,
  children,
  parents,
  projects: [1],
  projectItemType: "document",
  refType: "",
  refId: 0,
  contentId: id * 10,
  count: 0,
  createTime: 0,
  updateTime: 0,
});

// 根 → 章节(2) → 小节(3) → 正文(4)
const items = [node(2, "章节", [3], []), node(3, "小节", [4], [2]), node(4, "正文", [], [3])];

const mutation = { mutate: vi.fn(), isPending: false };
vi.mock("../queries", () => ({
  useProjectQuery: () => ({
    data: {
      id: 1,
      title: "项目甲",
      children: [2],
      pinned: false,
      archived: false,
      descText: "",
      updateTime: 0,
    },
  }),
  useProjectItemsQuery: () => ({ data: items, isLoading: false }),
  useProjectUpdate: () => mutation,
  useProjectDelete: () => mutation,
  useProjectItemCreate: () => mutation,
  useProjectItemDelete: () => mutation,
}));
vi.mock("../ProjectsPage", () => ({
  projectVisual: () => ({ grad: "", label: "", className: "" }),
}));
vi.mock("../../../components/StructureTreeSheet", () => ({ default: () => null }));
vi.mock("../../../components/BottomSheet", () => ({ default: () => null }));
vi.mock("../../../components/ActionSheet", () => ({ default: () => null }));
vi.mock("../../../components/MobileConfirmDialog", () => ({ default: () => null }));

import { ProjectDetailPage } from "../ProjectDetailPage";

describe("ProjectDetailPage 层级分页", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  function render(itemId: number | null) {
    const onOpenLevel = vi.fn();
    const onJumpToLevel = vi.fn();
    const onBack = vi.fn();
    act(() => {
      root.render(
        <ProjectDetailPage
          projectId={1}
          itemId={itemId}
          onBack={onBack}
          onOpenLevel={onOpenLevel}
          onJumpToLevel={onJumpToLevel}
          onOpenDocEditor={vi.fn()}
          onOpenCard={vi.fn()}
          onError={vi.fn()}
        />
      );
    });
    return { onOpenLevel, onJumpToLevel, onBack };
  }

  const clickText = (text: string) => {
    // 取最内层：面包屑段外层包裹（含分隔符）与内层文字同文本时，点击挂在内层
    const target = [...host.querySelectorAll<HTMLElement>("span, p")]
      .filter(element => element.textContent === text)
      .at(-1);
    expect(target, text).toBeTruthy();
    act(() => target?.click());
  };

  it("面包屑按 itemId 的节点链推出，当前层列出其子节点", () => {
    render(3);
    const crumbs = host.querySelector(".edge-fade-x-scroll")?.textContent;
    expect(crumbs).toBe("项目甲章节小节");
    expect(host.textContent).toContain("正文");
    // 子层不显示项目页头
    expect(host.querySelector("h1")).toBeNull();
  });

  it("点有子节点的条目：经 onOpenLevel 推入下一层", () => {
    const { onOpenLevel } = render(null);
    act(() =>
      [...host.querySelectorAll<HTMLElement>("p")]
        .find(p => p.textContent?.startsWith("章节"))
        ?.click()
    );
    expect(onOpenLevel).toHaveBeenCalledWith(2);
  });

  it("点祖先面包屑：经 onJumpToLevel 跳回；点当前层无操作", () => {
    const { onJumpToLevel } = render(3);
    clickText("项目甲");
    expect(onJumpToLevel).toHaveBeenLastCalledWith(null);
    clickText("章节");
    expect(onJumpToLevel).toHaveBeenLastCalledWith(2);
    clickText("小节");
    expect(onJumpToLevel).toHaveBeenCalledTimes(2);
  });

  it("顶栏返回直接交给宿主（由路由逐层退回）", () => {
    const { onBack } = render(3);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="返回"]')?.click());
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
