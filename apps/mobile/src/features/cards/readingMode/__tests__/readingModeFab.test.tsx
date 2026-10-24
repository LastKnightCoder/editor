import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingModeFab } from "../ReadingModeFab";

const OCCLUSION_VAR = "--mobile-editor-toolbar-occlusion";

/** 只关心 top / bottom：jsdom 不做布局，测试直接给出几何 */
function stubRect(element: Element, rect: { top?: number; bottom?: number }) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    top: rect.top ?? 0,
    bottom: rect.bottom ?? 0,
  } as DOMRect);
}

describe("ReadingModeFab", () => {
  let host: HTMLDivElement;
  let root: Root;
  let scroll: HTMLDivElement;
  let content: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    scroll = document.createElement("div");
    content = document.createElement("div");
    scroll.append(content);
    document.body.append(host, scroll);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function render(visible: boolean) {
    const onEnter = vi.fn();
    act(() => {
      root.render(
        <ReadingModeFab visible={visible} onEnter={onEnter} getScrollContainer={() => scroll} />
      );
    });
    return onEnter;
  }

  function scrollTo(top: number) {
    act(() => {
      scroll.scrollTop = top;
      scroll.dispatchEvent(new Event("scroll"));
    });
  }

  const button = () => host.querySelector<HTMLButtonElement>('button[aria-label="编辑"]');

  it("不可见时不渲染", () => {
    render(false);
    expect(button()).toBeNull();
  });

  it("可见时显示「编辑」，点击进入编辑，不为按钮占用正文末尾留白", () => {
    const onEnter = render(true);
    expect(button()?.textContent).toBe("编辑");
    expect(document.documentElement.style.getPropertyValue(OCCLUSION_VAR)).toBe("");
    act(() => button()?.click());
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("下滑收起为图标，上滑展开，回到顶部总是展开", () => {
    render(true);
    scrollTo(200);
    expect(button()?.textContent).toBe("");
    scrollTo(150);
    expect(button()?.textContent).toBe("编辑");
    scrollTo(400);
    expect(button()?.textContent).toBe("");
    scrollTo(10);
    expect(button()?.textContent).toBe("编辑");
  });

  it("正文末尾滚进按钮区域时淡出、不可点；离开后恢复；短内容末尾在按钮上方时常显", () => {
    stubRect(scroll, { bottom: 800 });
    render(true);
    stubRect(button()!, { top: 710 });

    // 末尾远在可视区下方：常显
    stubRect(content, { bottom: 1600 });
    scrollTo(100);
    expect(button()?.className).not.toContain("opacity-0");

    // 滚到底：末尾落在按钮区域内
    stubRect(content, { bottom: 760 });
    scrollTo(900);
    expect(button()?.className).toContain("opacity-0");
    expect(button()?.className).toContain("pointer-events-none");
    expect(button()?.getAttribute("aria-hidden")).toBe("true");

    // 往回滑出末尾区域：恢复
    stubRect(content, { bottom: 900 });
    scrollTo(760);
    expect(button()?.className).not.toContain("opacity-0");

    // 内容很短、末尾在按钮上方：不遮挡，常显
    stubRect(content, { bottom: 400 });
    scrollTo(0);
    expect(button()?.className).not.toContain("opacity-0");
  });
});
