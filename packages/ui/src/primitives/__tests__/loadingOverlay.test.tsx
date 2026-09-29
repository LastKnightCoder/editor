/**
 * LoadingOverlay 单测：进行中内容照常渲染并叠遮罩与 aria-busy；结束后遮罩移除。
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { LoadingOverlay } from "../LoadingOverlay";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LoadingOverlay", () => {
  it("进行中叠遮罩、内容保留；结束后移除", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderWith = (loading: boolean) =>
      act(() =>
        root.render(
          <LoadingOverlay loading={loading}>
            <span>内容</span>
          </LoadingOverlay>
        )
      );

    renderWith(true);
    const wrapper = container.firstElementChild!;
    expect(container.textContent).toContain("内容");
    expect(wrapper.getAttribute("aria-busy")).toBe("true");
    expect(wrapper.querySelector(".animate-spin")).not.toBeNull();

    renderWith(false);
    expect(wrapper.hasAttribute("aria-busy")).toBe(false);
    expect(wrapper.querySelector(".animate-spin")).toBeNull();
    expect(container.textContent).toBe("内容");

    act(() => root.unmount());
    container.remove();
  });
});
