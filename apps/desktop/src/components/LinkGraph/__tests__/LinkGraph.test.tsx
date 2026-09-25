import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EdgeData, NodeData } from "@antv/g6";
import type { ICard } from "@/types";
import LinkGraph from "..";

const mocks = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock("@antv/g6", () => ({
  NodeEvent: { CLICK: "click", POINTER_ENTER: "enter", POINTER_LEAVE: "leave" },
  CanvasEvent: { CLICK: "canvas-click" },
  Graph: class {
    data: { nodes: NodeData[]; edges: EdgeData[] } = { nodes: [], edges: [] };
    events = new Map<string, (...args: any[]) => void>();
    zoom = 1.7;
    constructor() {
      mocks.instances.push(this);
    }
    setData = vi.fn((data: typeof this.data) => {
      this.data = data;
    });
    getNodeData = (id?: string) =>
      id === undefined ? this.data.nodes : this.data.nodes.find(node => node.id === id);
    getZoom = () => this.zoom;
    getViewportByCanvas = vi.fn(() => [300, 200]);
    getElementState = (id: string) => this.data.nodes.find(node => node.id === id)?.states ?? [];
    setElementState = vi.fn((updates: Record<string, string[]>) => {
      for (const node of this.data.nodes) if (updates[node.id]) node.states = updates[node.id];
      return Promise.resolve();
    });
    on = (event: string, callback: (...args: any[]) => void) => {
      this.events.set(event, callback);
    };
    once = this.on;
    off = vi.fn();
    render = vi.fn(() => {
      this.events.get("afterrender")?.();
      return Promise.resolve();
    });
    draw = vi.fn(() => Promise.resolve());
    destroy = vi.fn();
    setNode = vi.fn();
    setEdge = vi.fn();
    setSize = vi.fn();
    fitView = vi.fn();
  },
}));
vi.mock("@/commands", () => ({ getCardById: vi.fn(async () => ({ content: [] })) }));
vi.mock("@/hooks/useTheme.ts", () => ({ default: () => ({ isDark: false }) }));
vi.mock("@/hooks", () => ({ useThemeColors: () => ({}) }));
vi.mock("@/stores/useDynamicExtensionsStore", () => ({ default: () => [] }));
vi.mock("@tau/editor/src", () => ({ Editor: () => null }));
vi.mock("@/components/Loading", () => ({ default: () => <span>加载中</span> }));

let root: Root;
let host: HTMLDivElement;
const cards = (count: number): ICard[] =>
  Array.from(
    { length: count },
    (_, index) =>
      ({
        id: index + 1,
        links: index + 1 < count ? [index + 2] : [],
        content: [],
        tags: [],
      }) as unknown as ICard
  );

beforeEach(() => {
  vi.useFakeTimers();
  mocks.instances.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function initialize(props: React.ComponentProps<typeof LinkGraph>) {
  await act(async () => root.render(<LinkGraph {...props} />));
  await act(async () => vi.advanceTimersByTime(40));
  return mocks.instances[0];
}

it("千节点高亮批量提交，开关预览及等值新数组不重新绘制或布局", async () => {
  const initCards = cards(1000);
  const ids = initCards.map(card => card.id);
  const graph = await initialize({ initCards, currentCardIds: ids });
  expect(graph.setElementState).toHaveBeenCalledTimes(1);
  expect(Object.keys(graph.setElementState.mock.calls[0][0])).toHaveLength(1000);
  graph.setElementState.mockClear();
  graph.draw.mockClear();
  for (const enableHoverPreview of [false, true]) {
    await act(async () =>
      root.render(
        <LinkGraph
          initCards={initCards}
          currentCardIds={[...ids]}
          enableHoverPreview={enableHoverPreview}
        />
      )
    );
  }
  expect(mocks.instances).toHaveLength(1);
  expect(graph.destroy).not.toHaveBeenCalled();
  expect(graph.render).toHaveBeenCalledTimes(1);
  expect(graph.draw).not.toHaveBeenCalled();
  expect(graph.setElementState).not.toHaveBeenCalled();
  await act(async () => root.render(<LinkGraph initCards={initCards} currentCardIds={[2, 3]} />));
  expect(graph.setElementState).toHaveBeenCalledTimes(1);
  expect(graph.getElementState("1")).toEqual([]);
  expect(graph.getElementState("2")).toEqual(["current"]);
});

it("正文、标签及顺序更新保留图实例，点击使用最新卡片", async () => {
  const initCards = cards(3);
  const onClickCard = vi.fn();
  const graph = await initialize({ initCards, onClickCard });
  const updated = { ...initCards[0], tags: ["新标签"], count: 99 };
  graph.draw.mockClear();
  await act(async () =>
    root.render(
      <LinkGraph
        initCards={[initCards[2], initCards[1], updated]}
        onClickCard={onClickCard}
        fitViewPadding={[40]}
      />
    )
  );
  await act(async () => graph.events.get("click")({ target: { id: "1" } }));
  expect(onClickCard).toHaveBeenCalledWith(updated);
  expect(graph.setData).toHaveBeenCalledTimes(1);
  expect(graph.draw).not.toHaveBeenCalled();
  expect(graph.destroy).not.toHaveBeenCalled();
});

it("节点与连线变更就地更新，保留已有位置、选择和视口", async () => {
  const initCards = cards(3);
  const graph = await initialize({ initCards, currentCardIds: [1] });
  graph.data.nodes[0].style = { ...graph.data.nodes[0].style, x: 123, y: 456 };
  graph.data.nodes[0].states.push("selected");
  graph.draw.mockClear();
  await act(async () =>
    root.render(
      <LinkGraph
        initCards={[
          { ...initCards[0], links: [4] },
          { ...initCards[1], id: 4, links: [] },
        ]}
        currentCardIds={[1, 4]}
      />
    )
  );
  expect(graph.destroy).not.toHaveBeenCalled();
  expect(graph.render).toHaveBeenCalledTimes(1);
  expect(graph.draw).toHaveBeenCalledTimes(1);
  expect(graph.data.nodes.map((node: NodeData) => node.id)).toEqual(["1", "4"]);
  expect(graph.data.nodes[0].style).toMatchObject({ x: 123, y: 456 });
  expect(graph.data.nodes[0].states).toEqual(["selected", "current"]);
  expect(graph.data.nodes[1].states).toEqual(["current"]);
  expect(graph.data.edges).toEqual([{ id: "1->4", source: "1", target: "4" }]);
  expect(graph.zoom).toBe(1.7);
  expect(graph.fitView).not.toHaveBeenCalled();
});

it("容器有偏移时，悬停预览在拖动画布和缩放后仍位于节点右下方", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 260,
    top: 100,
    width: 800,
    height: 600,
    right: 1060,
    bottom: 700,
    x: 260,
    y: 100,
    toJSON: () => ({}),
  });
  const graph = await initialize({ initCards: cards(2) });
  graph.data.nodes[0].style = { x: 50, y: 80, size: 20 };
  graph.zoom = 1;
  await act(async () => {
    graph.events.get("enter")({ target: { id: "1" }, client: { x: 560, y: 300 } });
    await vi.advanceTimersByTimeAsync(300);
  });
  const preview = host.querySelector<HTMLDivElement>(".absolute")!;
  expect(preview.style.left).toBe("310px");
  expect(preview.style.top).toBe("210px");
  graph.getViewportByCanvas.mockReturnValue([340, 220]);
  await act(async () => graph.events.get("canvas:drag")());
  expect(preview.style.left).toBe("350px");
  expect(preview.style.top).toBe("230px");
  graph.zoom = 2;
  graph.getViewportByCanvas.mockReturnValue([400, 260]);
  await act(async () => graph.events.get("wheel")());
  expect(preview.style.left).toBe("420px");
  expect(preview.style.top).toBe("280px");
});

it("卸载时销毁图实例并取消待执行的初始化", async () => {
  await act(async () => root.render(<LinkGraph initCards={cards(2)} />));
  await act(async () => root.render(null));
  await act(async () => vi.advanceTimersByTime(40));
  expect(mocks.instances).toHaveLength(0);
  const graph = await initialize({ initCards: cards(2) });
  await act(async () => root.render(null));
  expect(graph.destroy).toHaveBeenCalledTimes(1);
});
