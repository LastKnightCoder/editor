/**
 * 挂载级测试：验证 React 壳与引擎的接线（指针事件 → 命中 → 回调/预览），
 * 几何与配色由 core 的单测覆盖，这里不重复。
 */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ICard } from "@/types";
import { toItems } from "./fixtures";
import LinkGraph, { type LinkGraphPlaybackHandle } from "..";

const mocks = vi.hoisted(() => ({ getContentById: vi.fn() }));

vi.mock("@/commands/content", () => ({ getContentById: mocks.getContentById }));
// 宿主组件只验证自身逻辑，不渲染真实编辑器，kit 也不必真实构造
vi.mock("@/services/editorKit", () => ({
  createDesktopKit: () => ({}),
  getContentKit: () => ({}),
  getDescriptionKit: () => ({}),
  getMarkdownFileKit: () => ({}),
  getSkillFileKit: () => ({}),
  getFlashcardKit: () => ({}),
  getArrowLabelKit: () => ({}),
}));
vi.mock("@tau/editor", () => ({ Editor: () => null }));
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
  mocks.getContentById.mockReset();
  mocks.getContentById.mockResolvedValue({ content: [] });
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
    mount(<LinkGraph items={toItems([card(1, [2]), card(2, [1])])} />);
    expect(canvas()).toBeTruthy();
    expect(host.textContent).not.toContain("加载中");
  });

  it("空卡片集不报错，也不卡在 Loading", () => {
    mount(<LinkGraph items={toItems([])} />);
    expect(canvas()).toBeTruthy();
    expect(host.textContent).not.toContain("加载中");
  });

  it("点击节点回调对应卡片", () => {
    const onClickItem = vi.fn();
    // 单节点场景：fitView 把它放到视口正中，(400,300) 必然命中
    mount(<LinkGraph items={toItems([card(1)])} onClickItem={onClickItem} />);

    pointer("pointerdown", 400, 300);
    pointer("pointerup", 400, 300);
    expect(onClickItem).toHaveBeenCalledTimes(1);
    expect(onClickItem.mock.calls[0][0].id).toBe(1);
  });

  it("画布空白处点击不触发回调", () => {
    const onClickItem = vi.fn();
    mount(<LinkGraph items={toItems([card(1)])} onClickItem={onClickItem} />);
    pointer("pointerdown", 5, 5);
    pointer("pointerup", 5, 5);
    expect(onClickItem).not.toHaveBeenCalled();
  });

  it("拖拽超过阈值后松手算拖拽，不算点击", () => {
    const onClickItem = vi.fn();
    mount(<LinkGraph items={toItems([card(1)])} onClickItem={onClickItem} />);
    pointer("pointerdown", 400, 300);
    pointer("pointermove", 460, 360);
    pointer("pointerup", 460, 360);
    expect(onClickItem).not.toHaveBeenCalled();
  });

  it("悬停达到延迟后拉取卡片正文", async () => {
    mount(<LinkGraph items={toItems([card(1)])} />);
    pointer("pointermove", 400, 300);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(mocks.getContentById).toHaveBeenCalledWith(1);
  });

  it("enableHoverPreview 为 false 时不拉取正文", async () => {
    mount(<LinkGraph items={toItems([card(1)])} enableHoverPreview={false} />);
    pointer("pointermove", 400, 300);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(mocks.getContentById).not.toHaveBeenCalled();
  });

  it("悬停未满延迟就移开不会拉取正文", async () => {
    mount(<LinkGraph items={toItems([card(1)])} />);
    pointer("pointermove", 400, 300);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    pointer("pointermove", 5, 5);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(mocks.getContentById).not.toHaveBeenCalled();
  });

  it("鼠标从节点挪到它的标题上不断开悬停（否则标题一消失、鼠标又落回节点，来回闪）", async () => {
    mount(<LinkGraph items={toItems([card(1)])} enableHoverPreview={false} />);
    pointer("pointermove", 400, 300);
    // 等一帧：悬停标题的范围是渲染时算出来的
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(canvas().style.cursor).toBe("pointer");
    // 挪到节点正下方的标题区：已离开节点命中圆，仍保持悬停
    for (let y = 300; y <= 360; y += 4) pointer("pointermove", 400, y);
    expect(canvas().style.cursor).toBe("pointer");
    // 离开标题范围才断开
    pointer("pointermove", 5, 5);
    expect(canvas().style.cursor).toBe("grab");
  });

  it("卡片增删后不重建整个组件，也不抛错", () => {
    const first = [card(1, [2]), card(2, [1])];
    mount(<LinkGraph items={toItems(first)} />);
    act(() => root.render(<LinkGraph items={toItems([...first, card(3, [1])])} />));
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
    mount(<LinkGraph items={toItems(cards)} onClusters={onClusters} />);
    expect(onClusters).toHaveBeenCalledTimes(1);
    const insight = onClusters.mock.calls[0][0];
    expect(insight.clusters.length).toBe(2);
    expect(insight.isolated).toEqual([7]);
    expect(insight.modularity).toBeGreaterThan(0);
  });

  it("宿主每次渲染传新的 onClusters 不会触发重算", () => {
    const cards = [card(1, [2]), card(2, [1])];
    const first = vi.fn();
    mount(<LinkGraph items={toItems(cards)} onClusters={first} />);
    const second = vi.fn();
    act(() => root.render(<LinkGraph items={toItems(cards)} onClusters={second} />));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("currentCardIds 变化不重建画布元素", () => {
    const cards = [card(1, [2]), card(2, [1])];
    mount(<LinkGraph items={toItems(cards)} currentCardIds={[1]} />);
    const before = canvas();
    act(() => root.render(<LinkGraph items={toItems(cards)} currentCardIds={[2]} />));
    expect(canvas()).toBe(before);
  });

  describe("说明行与生长动画", () => {
    const DAY = 86_400_000;
    const dated = (id: number, time: number) => ({ ...card(id), create_time: time }) as ICard;
    const cards = [
      dated(1, Date.UTC(2021, 2, 5)),
      dated(2, Date.UTC(2021, 2, 5) + DAY),
      dated(3, Date.UTC(2022, 0, 1)),
    ];
    const caption = () => host.querySelector<HTMLButtonElement>("button");

    it("不开 caption 时画布上没有任何入口，也不会播", () => {
      mount(<LinkGraph items={toItems(cards)} />);
      expect(caption()).toBeNull();
    });

    it("平时是一行描述：条数 + 始于哪个月；进入图谱不自动播", () => {
      const onPlaybackChange = vi.fn();
      mount(<LinkGraph items={toItems(cards)} caption onPlaybackChange={onPlaybackChange} />);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(caption()!.textContent).toBe("3 条笔记 · 始于 2021年3月");
      expect(onPlaybackChange).not.toHaveBeenCalledWith(expect.objectContaining({ active: true }));
    });

    it("点一下开始播放，文字变成进度；没有进度条、暂停与倍速；播完变回描述", () => {
      const onPlaybackChange = vi.fn();
      mount(<LinkGraph items={toItems(cards)} caption onPlaybackChange={onPlaybackChange} />);
      act(() => caption()!.click());
      expect(onPlaybackChange).toHaveBeenLastCalledWith(expect.objectContaining({ active: true }));
      expect(caption()!.textContent).toContain("0 条");
      expect(host.querySelector('input[type="range"]')).toBeNull();
      expect(host.querySelectorAll("button")).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(caption()!.textContent).toBe("3 条笔记 · 始于 2021年3月");
      expect(onPlaybackChange).toHaveBeenLastCalledWith(expect.objectContaining({ active: false }));
    });

    it("播放中再点一下或按 Esc 直接跳到结尾", () => {
      mount(<LinkGraph items={toItems(cards)} caption />);
      act(() => caption()!.click());
      act(() => caption()!.click());
      expect(caption()!.textContent).toContain("3 条笔记");
      act(() => caption()!.click());
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(caption()!.textContent).toContain("3 条笔记");
    });

    it("宿主传的邀请语替换描述；宿主也能经把手直接播放", () => {
      const handle = createRef<LinkGraphPlaybackHandle>();
      mount(
        <LinkGraph
          items={toItems(cards)}
          caption
          captionHint="长到 500 张了 · 看看它是怎么长出来的"
          playbackRef={handle}
        />
      );
      expect(caption()!.textContent).toBe("长到 500 张了 · 看看它是怎么长出来的");
      act(() => handle.current!.play());
      expect(caption()!.textContent).toContain("0 条");
    });
  });
});
