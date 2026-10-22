import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeLayoutEntry } from "@/types/home-layout";
import { arrangePanels, mergeLayout, movePanel, type HomePanelDefinition } from "../layout";
import { HomePanels } from "../views/HomePanels";

const panel = (
  id: string,
  size: HomePanelDefinition["size"] = "wide",
  empty = false
): HomePanelDefinition => ({
  id,
  title: `标题${id}`,
  size,
  component: () =>
    empty ? null : (
      <section>
        <h2>面板{id}</h2>
        <button type="button">前往{id}</button>
      </section>
    ),
});

describe("首页布局", () => {
  it("保存过的顺序在前并保留未注册的面板，没保存过的按默认顺序追加", () => {
    const saved = [
      { id: "b", hidden: false },
      { id: "plugin:x:p", hidden: false },
      { id: "a", hidden: true },
    ];
    expect(mergeLayout(["a", "b", "c"], saved).map(e => e.id)).toEqual([
      "b",
      "plugin:x:p",
      "a",
      "c",
    ]);
    const { shown, hidden } = arrangePanels([panel("a"), panel("b"), panel("c")], saved);
    expect(shown.map(p => p.id)).toEqual(["b", "c"]);
    expect(hidden.map(p => p.id)).toEqual(["a"]);
  });

  it("移动到相邻面板前后，未注册的面板位置不变", () => {
    const layout = ["a", "x", "b", "c"].map(id => ({ id, hidden: false }));
    expect(movePanel(layout, "c", "b", "before").map(e => e.id)).toEqual(["a", "x", "c", "b"]);
    expect(movePanel(layout, "a", "b", "after").map(e => e.id)).toEqual(["x", "b", "a", "c"]);
    expect(movePanel(layout, "a", "missing", "after")).toEqual(layout);
  });
});

describe("HomePanels", () => {
  let container: HTMLDivElement;
  let root: Root;
  let layout: HomeLayoutEntry[];
  let editing: boolean;
  const panels = [panel("a", "compact"), panel("empty", "wide", true), panel("b"), panel("c")];

  const render = () =>
    act(() =>
      root.render(
        <HomePanels
          panels={panels}
          layout={layout}
          editing={editing}
          onChange={next => {
            layout = next;
            render();
          }}
        />
      )
    );
  const wrapper = (id: string) =>
    container.querySelector<HTMLElement>(`[data-home-panel="${id}"]`) as HTMLElement;
  const order = () =>
    [...container.querySelectorAll<HTMLElement>("[data-home-panel]")].map(
      el => el.dataset.homePanel
    );
  const button = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.getAttribute("aria-label") === label || b.textContent === label
    );
  /** jsdom 没有 PointerEvent：用带 pointerId 的鼠标事件 */
  const pointer = (target: EventTarget, type: string, init: MouseEventInit = {}) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
      Object.defineProperty(event, "pointerId", { value: 1 });
      target.dispatchEvent(event);
    });
  /** jsdom 不排版：命中按面板的布局位置（offset*）算，由测试指定 */
  const box = (el: HTMLElement, { left = 0, top = 0, width = 1000, height = 100 }) => {
    for (const [key, value] of Object.entries({
      offsetLeft: left,
      offsetTop: top,
      offsetWidth: width,
      offsetHeight: height,
    }))
      Object.defineProperty(el, key, { configurable: true, value });
    (el.parentElement as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, right: 1000, top: 0, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
    // 隐藏区排在面板之后
    if (container.querySelector("[data-home-hidden-panels]")) trayAt(1012);
  };
  const trayAt = (top: number) => {
    const tray = container.querySelector("[data-home-hidden-panels]") as HTMLElement;
    tray.getBoundingClientRect = () =>
      ({ left: 0, right: 1000, top, bottom: top + 50, width: 1000, height: 50 }) as DOMRect;
    return tray;
  };
  /** 按下、越过拖动阈值移到 (x, y)；返回松手函数 */
  const press = (from: Element, x: number, y: number) => {
    pointer(from, "pointerdown", { button: 0, clientX: 1, clientY: 1 });
    pointer(window, "pointermove", { clientX: x, clientY: y });
    return () => pointer(window, "pointerup", { clientX: x, clientY: y });
  };
  const drag = (from: Element, x: number, y: number) => press(from, x, y)();
  const slot = () => container.querySelector<HTMLElement>("[data-home-panel-slot]");
  const nextFrame = () =>
    act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    layout = [];
    editing = false;
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("平时按布局显示，空面板不占位，没有编辑控件；紧凑面板可伸展，宽面板占整行", () => {
    render();
    expect(order()).toEqual(["a", "empty", "b", "c"]);
    expect(wrapper("a").className).toContain("flex-[1_1_340px]");
    expect(wrapper("b").className).toContain("basis-full");
    expect(wrapper("empty").className).toContain("has-[>[data-home-panel-content]:empty]:hidden");
    expect(button("移动「标题a」")).toBeUndefined();
    expect(container.querySelector("[data-home-hidden-panels]")).toBeNull();
  });

  it("编辑模式：内容不可点，空面板显示占位卡", () => {
    editing = true;
    render();
    expect(wrapper("a").querySelector("[data-home-panel-content]")?.hasAttribute("inert")).toBe(
      true
    );
    expect(wrapper("empty").querySelector("[data-home-panel-placeholder]")?.textContent).toBe(
      "标题empty · 今天没有内容"
    );
    expect(wrapper("empty").className).not.toContain(":hidden");
  });

  it("拖起后原位留空位、其余面板实时让位；松手按让位后的顺序保存", () => {
    editing = true;
    render();
    // a 紧凑在第一行左侧，empty / b / c 各占一行
    box(wrapper("a"), { left: 0, top: 0, width: 400 });
    box(wrapper("empty"), { top: 112 });
    box(wrapper("b"), { top: 224 });
    box(wrapper("c"), { top: 336 });
    const release = press(wrapper("c"), 50, 240);
    expect(slot()?.dataset.homePanel).toBe("c");
    expect(document.querySelector("[aria-hidden] [data-home-panel-content]")).not.toBeNull();
    // 整行面板的上半部：插在前面，松手前就已让位
    expect(order()).toEqual(["a", "empty", "c", "b"]);
    expect(layout).toEqual([]);
    release();
    expect(order()).toEqual(["a", "empty", "c", "b"]);
    expect(slot()).toBeNull();
    expect(document.querySelector("[aria-hidden] [data-home-panel-content]")).toBeNull();

    // 紧凑面板的右半边：插在后面
    box(wrapper("b"), { top: 336 });
    drag(wrapper("b"), 300, 50);
    expect(order()).toEqual(["a", "b", "empty", "c"]);
  });

  it("Esc 取消：回到原顺序，不保存", async () => {
    editing = true;
    render();
    box(wrapper("a"), { left: 0, top: 0, width: 400 });
    box(wrapper("empty"), { top: 112 });
    box(wrapper("b"), { top: 224 });
    box(wrapper("c"), { top: 336 });
    const release = press(wrapper("c"), 10, 20);
    expect(order()).toEqual(["c", "a", "empty", "b"]);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(order()).toEqual(["a", "empty", "b", "c"]);
    await nextFrame();
    expect(slot()).toBeNull();
    release();
    expect(order()).toEqual(["a", "empty", "b", "c"]);
    expect(layout).toEqual([]);
  });

  it("没越过阈值不算拖动；拖动中退出编辑模式不留空位与浮起的卡片", () => {
    editing = true;
    render();
    box(wrapper("a"), { left: 0, top: 0, width: 400 });
    pointer(wrapper("c"), "pointerdown", { button: 0, clientX: 1, clientY: 1 });
    pointer(window, "pointermove", { clientX: 3, clientY: 2 });
    expect(slot()).toBeNull();
    pointer(window, "pointerup");
    expect(order()).toEqual(["a", "empty", "b", "c"]);

    press(wrapper("c"), 10, 20);
    expect(slot()?.dataset.homePanel).toBe("c");
    editing = false;
    render();
    expect(slot()).toBeNull();
    expect(order()).toEqual(["a", "empty", "b", "c"]);
    expect(document.querySelector("[aria-hidden] [data-home-panel-content]")).toBeNull();
  });

  it("把手上的方向键移动，并保持焦点", () => {
    editing = true;
    render();
    const handle = button("移动「标题a」") as HTMLButtonElement;
    handle.focus();
    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(order()).toEqual(["empty", "a", "b", "c"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("移动「标题a」");
    act(() => {
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
      );
    });
    expect(order()).toEqual(["a", "empty", "b", "c"]);
  });

  it("隐藏后进「已隐藏」区；点击恢复到末尾，拖回可放到任意位置，拖进去即隐藏", () => {
    editing = true;
    render();
    act(() => button("隐藏「标题b」")?.click());
    expect(order()).toEqual(["a", "empty", "c"]);
    const tray = container.querySelector("[data-home-hidden-panels]") as HTMLElement;
    expect(tray.textContent).toContain("标题b");
    act(() => button("标题b")?.click());
    expect(order()).toEqual(["a", "empty", "c", "b"]);

    // 拖进隐藏区：空位收起，区内出现「松手隐藏」
    const release = press(wrapper("a"), 50, trayAt(600).getBoundingClientRect().top + 20);
    expect(order()).toEqual(["empty", "c", "b"]);
    expect(tray.querySelector("[data-home-hidden-pending]")?.textContent).toBe("松手隐藏「标题a」");
    expect(tray.dataset.dropOver).toBe("true");
    release();
    expect(order()).toEqual(["empty", "c", "b"]);
    expect(tray.textContent).toContain("标题a");
    expect(tray.querySelector("[data-home-hidden-pending]")).toBeNull();

    // 从隐藏区拖回第一块之前；松手那次 click 不算「恢复到末尾」
    box(wrapper("empty"), { top: 0 });
    box(wrapper("c"), { top: 112 });
    box(wrapper("b"), { top: 224 });
    trayAt(600);
    const chip = button("标题a") as HTMLElement;
    drag(chip, 50, 10);
    act(() => chip.click());
    expect(order()).toEqual(["a", "empty", "c", "b"]);
    expect(layout.every(entry => !entry.hidden)).toBe(true);
    // 平时不显示已隐藏的面板
    act(() => button("隐藏「标题c」")?.click());
    editing = false;
    render();
    expect(order()).toEqual(["a", "empty", "b"]);
    expect(container.querySelector("[data-home-hidden-panels]")).toBeNull();
  });
});
