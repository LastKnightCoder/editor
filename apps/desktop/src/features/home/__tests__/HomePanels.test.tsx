import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeLayoutEntry } from "@/types/home-layout";
import { arrangePanels, mergeLayout, movePanel, type HomePanelDefinition } from "../layout";
import { HomePanelMenu, HomePanels } from "../views/HomePanels";

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
        <h2>
          面板{id}
          <HomePanelMenu />
        </h2>
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
  const panels = [panel("a", "compact"), panel("empty", "wide", true), panel("b"), panel("c")];

  const render = () =>
    act(() =>
      root.render(
        <HomePanels
          panels={panels}
          layout={layout}
          onChange={next => {
            layout = next;
            render();
          }}
        />
      )
    );
  const order = () =>
    [...container.querySelectorAll("[data-home-panel]")]
      .filter(el => el.childElementCount > 0)
      .map(el => (el as HTMLElement).dataset.homePanel);
  const openMenu = (id: string) =>
    act(() =>
      container
        .querySelector<HTMLButtonElement>(`[data-home-panel="${id}"] button[aria-label="调整面板"]`)
        ?.click()
    );
  const menuItem = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('[data-open="true"] [role="menuitem"]')].find(
      el => el.textContent === label
    );
  const select = (label: string) => act(() => menuItem(label)?.click());

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    layout = [];
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("默认按注册顺序；紧凑面板可伸展，宽面板占整行；空面板不占位", () => {
    render();
    expect(order()).toEqual(["a", "b", "c"]);
    const wrapper = (id: string) =>
      container.querySelector(`[data-home-panel="${id}"]`)?.className ?? "";
    expect(wrapper("a")).toContain("flex-[1_1_340px]");
    expect(wrapper("b")).toContain("basis-full");
    expect(wrapper("empty")).toContain("empty:hidden");
  });

  it("上移、下移跳过没有内容的面板，到头时不可用", async () => {
    render();
    openMenu("a");
    expect(menuItem("上移")?.getAttribute("aria-disabled")).toBe("true");
    select("下移");
    // a 越过空面板，排到 b 之后
    expect(order()).toEqual(["b", "a", "c"]);
    expect(layout.map(e => e.id)).toEqual(["empty", "b", "a", "c"]);
    openMenu("c");
    expect(menuItem("下移")?.getAttribute("aria-disabled")).toBe("true");
    select("上移");
    expect(order()).toEqual(["b", "c", "a"]);
  });

  it("隐藏后可从末尾恢复，回到原来的位置", () => {
    render();
    openMenu("b");
    select("隐藏");
    expect(order()).toEqual(["a", "c"]);
    const restore = [...container.querySelectorAll("button")].find(b =>
      b.textContent?.includes("显示已隐藏的面板")
    );
    expect(restore?.textContent).toContain("1");
    act(() => restore?.click());
    select("标题b");
    expect(order()).toEqual(["a", "b", "c"]);
    expect(container.textContent).not.toContain("显示已隐藏的面板");
  });
});
