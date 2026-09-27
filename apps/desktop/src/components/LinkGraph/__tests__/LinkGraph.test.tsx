/**
 * 挂载级测试：验证 React 壳与引擎的接线（指针事件 → 命中 → 回调/预览），
 * 几何与配色由 core 的单测覆盖，这里不重复。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ICard } from "@/types";
import LinkGraph from "..";

const mocks = vi.hoisted(() => ({ getCardById: vi.fn() }));

vi.mock("@/commands", () => ({ getCardById: mocks.getCardById }));
vi.mock("@/stores/useDynamicExtensionsStore", () => ({ default: () => [] }));
vi.mock("@tau/editor/src", () => ({ Editor: () => null }));
vi.mock("@/components/Loading", () => ({ default: () => <span>加载中</span> }));

let root: Root;
let host: HTMLDivElement;

const card = (id: number, links: number[] = []): ICard =>
  ({
    id,
    links,
    content: [{ type: "paragraph", children: [{ type: "formatted", text: `卡片${id}` }] }],
    create_time: id,
    tags: [],
  }) as unknown as ICard;

const canvas = () => host.querySelector("canvas")!;

/**
 * 在画布上派发指针事件。必须包 act：事件处理器会同步收起预览面板（setState），
 * 不包就是 React 的「update not wrapped in act」告警。
 */
const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) => {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...init });
  Object.defineProperty(event, "pointerId", { value: 1 });
  act(() => {
    canvas().dispatchEvent(event);
  });
};

beforeEach(() => {
  mocks.getCardById.mockReset();
  mocks.getCardById.mockResolvedValue({ content: [] });
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  // jsdom 下 clientWidth/Height 恒为 0，引擎会算出退化的视口
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
    value: () => {},
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "releasePointerCapture", {
    value: () => {},
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "hasPointerCapture", {
    value: () => true,
    configurable: true,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const mount = (element: React.ReactElement) => {
  act(() => root.render(element));
  // 布局收敛 + 首帧
  act(() => {
    vi.advanceTimersByTime(50);
  });
};

describe("LinkGraph", () => {
  it("渲染 canvas，布局收敛后撤掉 Loading", () => {
    mount(<LinkGraph initCards={[card(1, [2]), card(2, [1])]} />);
    expect(canvas()).toBeTruthy();
    expect(host.textContent).not.toContain("加载中");
  });

  it("空卡片集不报错，也不卡在 Loading", () => {
    mount(<LinkGraph initCards={[]} />);
    expect(canvas()).toBeTruthy();
    expect(host.textContent).not.toContain("加载中");
  });

  it("点击节点回调对应卡片", () => {
    const onClickCard = vi.fn();
    // 单节点场景：fitView 把它放到视口正中，(400,300) 必然命中
    mount(<LinkGraph initCards={[card(1)]} onClickCard={onClickCard} />);

    pointer("pointerdown", 400, 300);
    pointer("pointerup", 400, 300);
    expect(onClickCard).toHaveBeenCalledTimes(1);
    expect(onClickCard.mock.calls[0][0].id).toBe(1);
  });

  it("画布空白处点击不触发回调", () => {
    const onClickCard = vi.fn();
    mount(<LinkGraph initCards={[card(1)]} onClickCard={onClickCard} />);
    pointer("pointerdown", 5, 5);
    pointer("pointerup", 5, 5);
    expect(onClickCard).not.toHaveBeenCalled();
  });

  it("拖拽超过阈值后松手算拖拽，不算点击", () => {
    const onClickCard = vi.fn();
    mount(<LinkGraph initCards={[card(1)]} onClickCard={onClickCard} />);
    pointer("pointerdown", 400, 300);
    pointer("pointermove", 460, 360);
    pointer("pointerup", 460, 360);
    expect(onClickCard).not.toHaveBeenCalled();
  });

  it("悬停达到延迟后拉取卡片正文", async () => {
    mount(<LinkGraph initCards={[card(1)]} />);
    pointer("pointermove", 400, 300);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(mocks.getCardById).toHaveBeenCalledWith(1);
  });

  it("enableHoverPreview 为 false 时不拉取正文", async () => {
    mount(<LinkGraph initCards={[card(1)]} enableHoverPreview={false} />);
    pointer("pointermove", 400, 300);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(mocks.getCardById).not.toHaveBeenCalled();
  });

  it("悬停未满延迟就移开不会拉取正文", async () => {
    mount(<LinkGraph initCards={[card(1)]} />);
    pointer("pointermove", 400, 300);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    pointer("pointermove", 5, 5);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(mocks.getCardById).not.toHaveBeenCalled();
  });

  it("卡片增删后不重建整个组件，也不抛错", () => {
    const first = [card(1, [2]), card(2, [1])];
    mount(<LinkGraph initCards={first} />);
    act(() => root.render(<LinkGraph initCards={[...first, card(3, [1])]} />));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(canvas()).toBeTruthy();
  });

  it("簇划分算完后回调给宿主，带主题簇、孤立卡片与模块度", () => {
    const onClusters = vi.fn();
    // 两个三角形 + 一张孤立卡片
    const cards = [
      card(1, [2, 3]),
      card(2, [1, 3]),
      card(3, [1, 2]),
      card(4, [5, 6]),
      card(5, [4, 6]),
      card(6, [4, 5, 1]),
      card(7),
    ];
    mount(<LinkGraph initCards={cards} onClusters={onClusters} />);
    expect(onClusters).toHaveBeenCalledTimes(1);
    const insight = onClusters.mock.calls[0][0];
    expect(insight.clusters.length).toBe(2);
    expect(insight.isolated).toEqual([7]);
    expect(insight.modularity).toBeGreaterThan(0);
  });

  it("宿主每次渲染传新的 onClusters 不会触发重算", () => {
    const cards = [card(1, [2]), card(2, [1])];
    const first = vi.fn();
    mount(<LinkGraph initCards={cards} onClusters={first} />);
    const second = vi.fn();
    act(() => root.render(<LinkGraph initCards={cards} onClusters={second} />));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("currentCardIds 变化不重建画布元素", () => {
    const cards = [card(1, [2]), card(2, [1])];
    mount(<LinkGraph initCards={cards} currentCardIds={[1]} />);
    const before = canvas();
    act(() => root.render(<LinkGraph initCards={cards} currentCardIds={[2]} />));
    expect(canvas()).toBe(before);
  });
});
