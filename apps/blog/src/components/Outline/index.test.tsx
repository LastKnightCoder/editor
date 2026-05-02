import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Outline from "./index";

describe("blog/Outline", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalActEnvironment = (globalThis as Record<string, unknown>)
    .IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => undefined;
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
      originalActEnvironment;
    vi.restoreAllMocks();
  });

  it("四级标题应比三级标题显示更深的缩进，且缩进不应挂在整行按钮上", async () => {
    await act(async () => {
      root.render(
        <Outline
          headers={[
            { title: "三级标题", level: 3 },
            { title: "四级标题", level: 4 },
          ]}
        />,
      );
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);

    expect(buttons[0].className).not.toContain("pl-");
    expect(buttons[1].className).not.toContain("pl-");

    const labels = buttons.map((button) => button.querySelector("span"));
    expect(labels[0]).not.toBeNull();
    expect(labels[1]).not.toBeNull();
    expect((labels[0] as HTMLSpanElement).style.paddingLeft).toBe("2.5rem");
    expect((labels[1] as HTMLSpanElement).style.paddingLeft).toBe("3.5rem");
  });

  it("activeIndex 命中时应渲染激活态目录项", async () => {
    await act(async () => {
      root.render(
        <Outline
          headers={[
            { title: "第一节", level: 1 },
            { title: "第二节", level: 2 },
          ]}
          activeIndex={1}
        />,
      );
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons[0]?.getAttribute("data-outline-active")).toBeNull();
    expect(buttons[1]?.getAttribute("data-outline-active")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-current")).toBe("true");
  });
});
