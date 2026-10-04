import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeMapItem } from "@/knowledge-map/types";
import { countByKind, filterHits, indexOfKey, toGraphItems } from "../model";

const item = (
  key: string,
  links: string[] = [],
  projectId: number | null = null
): KnowledgeMapItem => {
  const [kind, id] = key.split(":");
  return {
    key,
    kind: kind as KnowledgeMapItem["kind"],
    id: Number(id),
    contentId: Number(id) * 10,
    title: `标题${id}`,
    createdAt: Number(id),
    tags: [],
    links,
    projectId,
    projectTitle: projectId ? `项目${projectId}` : null,
  };
};

const ITEMS = [
  item("article:3", ["card:1", "card:404"]),
  item("card:1", ["project-item:5"]),
  item("project-item:5", [], 9),
];

describe("知识地图纯函数", () => {
  it("下标作数值 id，连线按键转下标，丢弃不在列表里的", () => {
    const graph = toGraphItems(ITEMS);
    expect(graph.map(g => [g.id, g.key, g.links])).toEqual([
      [0, "article:3", [1]],
      [1, "card:1", [2]],
      [2, "project-item:5", []],
    ]);
    expect(graph[0]).toMatchObject({ label: "标题3", contentId: 30 });
  });

  it("没有筛选时为 null；类型与项目叠加筛选", () => {
    expect(filterHits(ITEMS, { kind: null, projectId: null })).toBeNull();
    expect(filterHits(ITEMS, { kind: "card", projectId: null })).toEqual([1]);
    expect(filterHits(ITEMS, { kind: null, projectId: 9 })).toEqual([2]);
    expect(filterHits(ITEMS, { kind: "card", projectId: 9 })).toEqual([]);
  });

  it("按类型计数；focus 键转下标", () => {
    expect(countByKind(ITEMS)).toEqual({ card: 1, article: 1, "project-item": 1 });
    expect(indexOfKey(ITEMS, "card:1")).toBe(1);
    expect(indexOfKey(ITEMS, "card:404")).toBeNull();
    expect(indexOfKey(ITEMS, undefined)).toBeNull();
  });
});

const mocks = vi.hoisted(() => ({
  graphProps: null as Record<string, any> | null,
  params: {} as { focus?: string },
  openEntity: vi.fn(async () => {}),
  data: null as unknown,
  onPreview: null as null | ((end: Record<string, unknown>) => void),
}));

vi.mock("@/components/LinkGraph", () => ({
  default: (props: Record<string, any>) => {
    mocks.graphProps = props;
    return <div data-testid="graph" />;
  },
}));
vi.mock("../queries", () => ({
  useKnowledgeMap: () => ({ data: mocks.data, isPending: false, isFetching: false }),
}));
vi.mock("@/page/PageProvider", () => ({
  usePageParams: () => mocks.params,
  useOverlayDismiss: () => undefined,
}));
vi.mock("@/components/ContentEditor", () => ({
  default: ({ contentId, at }: { contentId: number; at?: string }) => (
    <div data-preview-content={contentId} data-at={at} />
  ),
}));
// 洞见视图有自己的测试（useMapInsights.test.tsx）；这里只看地图页本身
vi.mock("../insights/useMapInsights", () => ({
  useMapInsights: (_topics: unknown, _initial: unknown, onPreview: unknown) => {
    mocks.onPreview = onPreview as typeof mocks.onPreview;
    return {
      enabled: false,
      view: "off",
      button: null,
      report: null,
      overlay: null,
      overlayRef: () => undefined,
      floating: null,
    };
  },
}));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));

import { KnowledgeMapView } from "../views/KnowledgeMapView";
import { useGraphMilestoneStore } from "../milestones";

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(<KnowledgeMapView />));
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.startsWith(text))!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.graphProps = null;
  mocks.params = {};
  mocks.data = { status: "ready", map: null, items: ITEMS };
  // 已经播过：不触发自动播
  useGraphMilestoneStore.setState({ seenByDatabase: new Proxy({}, { get: () => 100000 }) });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("KnowledgeMapView", () => {
  it("统计各类数量；点类型 pill 只降淡未命中，不删节点", () => {
    render();
    expect(container.textContent).toContain("卡片 1 · 文章 1 · 项目文档 1");
    expect(mocks.graphProps!.items).toHaveLength(3);
    expect(mocks.graphProps!.filterCardIds).toBeNull();
    act(() => button("文章").click());
    expect(mocks.graphProps!.items).toHaveLength(3);
    expect(mocks.graphProps!.filterCardIds).toEqual([0]);
    act(() => button("全部").click());
    expect(mocks.graphProps!.filterCardIds).toBeNull();
  });

  it("focus 参数对准并强调对应节点；点击节点先在 Drawer 预览，点「打开」才进详情", () => {
    mocks.openEntity.mockClear();
    mocks.params = { focus: "project-item:5" };
    render();
    expect(mocks.graphProps!.focusId).toBe(2);
    expect(mocks.graphProps!.currentCardIds).toEqual([2]);
    act(() => mocks.graphProps!.onClickItem({ key: "article:3" }));
    expect(mocks.openEntity).not.toHaveBeenCalled();
    expect(mocks.graphProps!.currentCardIds).toEqual([2, 0]);
    const contentId = ITEMS.find(item => item.key === "article:3")!.contentId;
    expect(container.querySelector(`[data-preview-content="${contentId}"]`)).not.toBeNull();
    act(() => button("打开").click());
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "article", id: 3 }, {});
  });

  it("洞见气泡里的笔记：在地图上的进 Drawer 并定位到那一节，打开时带着位置；不在地图上的直接打开", () => {
    mocks.openEntity.mockClear();
    render();
    act(() => mocks.onPreview!({ ref: { kind: "card", id: 1 }, block: 4 }));
    expect(mocks.openEntity).not.toHaveBeenCalled();
    expect(container.querySelector('[data-preview-content="10"]')?.getAttribute("data-at")).toBe(
      JSON.stringify({ block: 4 })
    );
    act(() => button("打开").click());
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "card", id: 1 }, { at: { block: 4 } });

    act(() => mocks.onPreview!({ ref: { kind: "card", id: 404 }, block: 0 }));
    expect(mocks.openEntity).toHaveBeenLastCalledWith(
      { kind: "card", id: 404 },
      { at: { block: 0 } }
    );
  });

  it("没有内容时显示空态", () => {
    mocks.data = { status: "ready", map: null, items: [] };
    render();
    expect(container.textContent).toContain("还没有可以放上地图的内容");
    expect(mocks.graphProps).toBeNull();
  });
});
