/**
 * Tabs 单测：非受控默认首项 · 点击切换 · 受控只回调不自改 · 方向键循环移动并聚焦 · tab/tabpanel 接线。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs, type TabItem } from "../Tabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items: TabItem<"a" | "b" | "c">[] = [
  { key: "a", label: "甲", children: <p>甲面板</p> },
  { key: "b", label: "乙", children: <p>乙面板</p> },
  { key: "c", label: "丙", children: <p>丙面板</p> },
];

describe("Tabs", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  const render = (ui: ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(ui));
    return container;
  };
  const tab = (key: string) => container!.querySelector<HTMLButtonElement>(`[data-tab="${key}"]`)!;
  const panelText = () => container!.querySelector('[role="tabpanel"]')?.textContent;

  it("非受控：默认首项，点击切换面板", () => {
    render(<Tabs items={items} />);
    expect(panelText()).toBe("甲面板");
    expect(tab("a").getAttribute("aria-selected")).toBe("true");
    act(() => tab("b").click());
    expect(panelText()).toBe("乙面板");
    expect(tab("a").getAttribute("aria-selected")).toBe("false");
  });

  it("受控：点击只回调，由外部决定是否切换", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} activeKey="a" onChange={onChange} />);
    act(() => tab("c").click());
    expect(onChange).toHaveBeenCalledWith("c");
    expect(panelText()).toBe("甲面板");
  });

  it("方向键循环移动，焦点跟随，roving tabindex", () => {
    render(<Tabs items={items} defaultActiveKey="c" />);
    act(() => tab("c").focus());
    act(() => {
      tab("c").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(panelText()).toBe("甲面板");
    expect(document.activeElement).toBe(tab("a"));
    expect(tab("a").tabIndex).toBe(0);
    expect(tab("c").tabIndex).toBe(-1);
  });

  it("tab 与 tabpanel 互相引用", () => {
    render(<Tabs items={items} />);
    const panel = container!.querySelector('[role="tabpanel"]')!;
    expect(tab("a").getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab("a").id);
  });
});
