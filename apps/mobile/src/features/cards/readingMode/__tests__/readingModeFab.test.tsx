import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingModeFab } from "../ReadingModeFab";

const OCCLUSION_VAR = "--mobile-editor-toolbar-occlusion";

describe("ReadingModeFab", () => {
  let host: HTMLDivElement;
  let root: Root;
  let scroll: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    scroll = document.createElement("div");
    document.body.append(host, scroll);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty(OCCLUSION_VAR);
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

  it("不可见时不渲染，也不占用正文末尾留白", () => {
    render(false);
    expect(button()).toBeNull();
    expect(document.documentElement.style.getPropertyValue(OCCLUSION_VAR)).toBe("");
  });

  it("可见时显示「编辑」，点击进入编辑，正文末尾让出按钮高度", () => {
    const onEnter = render(true);
    expect(button()?.textContent).toBe("编辑");
    expect(document.documentElement.style.getPropertyValue(OCCLUSION_VAR)).toBe("70px");
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
});
