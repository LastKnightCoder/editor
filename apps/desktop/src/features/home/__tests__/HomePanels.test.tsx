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
  /** jsdom 没有 DataTransfer：按类型存取，模拟同一次拖动 */
  const transfer = () => {
    const data = new Map<string, string>();
    return {
      get types() {
        return [...data.keys()];
      },
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };
  };
  const fire = (target: Element, type: string, dataTransfer: unknown, init: MouseEventInit = {}) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      target.dispatchEvent(event);
    });
  const drag = (from: Element, to: Element, init: MouseEventInit = {}) => {
    const data = transfer();
    fire(from, "dragstart", data);
    fire(to, "dragover", data, init);
    fire(to, "drop", data, init);
    fire(from, "dragend", data);
  };
  const rect = (el: Element, box: Partial<DOMRect>) => {
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, ...box }) as DOMRect;
  };

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
    expect(wrapper("a").draggable).toBe(false);
    expect(button("移动「标题a」")).toBeUndefined();
    expect(container.querySelector("[data-home-hidden-panels]")).toBeNull();
  });

  it("编辑模式：内容不可点，空面板显示占位卡，整块可拖动", () => {
    editing = true;
    render();
    expect(wrapper("a").draggable).toBe(true);
    expect(wrapper("a").querySelector("[data-home-panel-content]")?.hasAttribute("inert")).toBe(
      true
    );
    expect(wrapper("empty").querySelector("[data-home-panel-placeholder]")?.textContent).toBe(
      "标题empty · 今天没有内容"
    );
    expect(wrapper("empty").className).not.toContain(":hidden");
  });

  it("拖到整行面板的上半部插在前面，拖到紧凑面板的右半边插在后面", () => {
    editing = true;
    render();
    rect(wrapper("b"), { top: 100, height: 100 });
    drag(wrapper("c"), wrapper("b"), { clientY: 120 });
    expect(order()).toEqual(["a", "empty", "c", "b"]);
    rect(wrapper("a"), { left: 0, width: 400 });
    drag(wrapper("b"), wrapper("a"), { clientX: 300 });
    expect(order()).toEqual(["a", "b", "empty", "c"]);
    // 拖动中显示插入线，结束后消失
    const data = transfer();
    fire(wrapper("c"), "dragstart", data);
    fire(wrapper("a"), "dragover", data, { clientX: 10 });
    expect(
      wrapper("a").querySelector("[data-home-panel-drop]")?.getAttribute("data-home-panel-drop")
    ).toBe("before");
    fire(wrapper("c"), "dragend", data);
    expect(container.querySelector("[data-home-panel-drop]")).toBeNull();
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

    drag(wrapper("a"), tray);
    expect(order()).toEqual(["empty", "c", "b"]);
    rect(wrapper("empty"), { top: 0, height: 100 });
    drag(button("标题a") as HTMLElement, wrapper("empty"), { clientY: 10 });
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
