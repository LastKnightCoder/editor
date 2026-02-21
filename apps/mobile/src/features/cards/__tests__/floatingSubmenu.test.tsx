import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FloatingSubmenu from "@tau/editor/src/components/HoveringToolbar/FloatingSubmenu";

function setViewportSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

function mockRect(
  element: Element,
  partial: Partial<DOMRect> &
    Pick<DOMRect, "top" | "left" | "width" | "height">,
) {
  const rect: DOMRect = {
    x: partial.left,
    y: partial.top,
    top: partial.top,
    left: partial.left,
    width: partial.width,
    height: partial.height,
    right: partial.left + partial.width,
    bottom: partial.top + partial.height,
    toJSON() {
      return {};
    },
  } as DOMRect;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}

function FloatingSubmenuProbe(props: { trigger: "hover" | "click" }) {
  const [open, setOpen] = useState(false);
  return (
    <FloatingSubmenu
      open={open}
      onOpenChange={setOpen}
      trigger={props.trigger}
      isHoveringBarShow={true}
      content={
        <div
          data-testid="submenu-content"
          style={{ width: 220, height: 160, background: "#fff" }}
        >
          submenu
        </div>
      }
      zIndex={10100}
    >
      <button type="button" data-testid="submenu-trigger-button">
        trigger
      </button>
    </FloatingSubmenu>
  );
}

describe("FloatingSubmenu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setViewportSize(300, 220);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("open 后应在视口内完成定位，并支持 outside click 关闭", () => {
    act(() => {
      root.render(<FloatingSubmenuProbe trigger="click" />);
    });

    const trigger = document.querySelector(
      '[data-floating-submenu-trigger="true"]',
    ) as HTMLElement | null;
    expect(trigger).toBeTruthy();
    if (!trigger) return;
    mockRect(trigger, { top: 190, left: 260, width: 30, height: 20 });

    const button = document.querySelector(
      '[data-testid="submenu-trigger-button"]',
    ) as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const panel = document.querySelector(
      '[data-floating-submenu-panel="true"]',
    ) as HTMLElement | null;
    expect(panel).toBeTruthy();
    if (!panel) return;
    mockRect(panel, { top: 0, left: 0, width: 220, height: 160 });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(panel.style.left).toBe("72px");
    expect(panel.style.top).toBe("22px");

    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(
      document.querySelector('[data-floating-submenu-panel="true"]'),
    ).toBeNull();
  });

  it("hover 模式下从 trigger 移入 panel 不应闪退，离开后延时关闭", () => {
    vi.useFakeTimers();
    act(() => {
      root.render(<FloatingSubmenuProbe trigger="hover" />);
    });

    const trigger = document.querySelector(
      '[data-floating-submenu-trigger="true"]',
    ) as HTMLElement | null;
    expect(trigger).toBeTruthy();
    if (!trigger) return;
    mockRect(trigger, { top: 120, left: 120, width: 40, height: 24 });

    act(() => {
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    const panel = document.querySelector(
      '[data-floating-submenu-panel="true"]',
    ) as HTMLElement | null;
    expect(panel).toBeTruthy();
    if (!panel) return;
    mockRect(panel, { top: 0, left: 0, width: 220, height: 160 });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    act(() => {
      trigger.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      panel.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(200);
    });
    expect(
      document.querySelector('[data-floating-submenu-panel="true"]'),
    ).toBeTruthy();

    act(() => {
      panel.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      vi.advanceTimersByTime(200);
    });
    expect(
      document.querySelector('[data-floating-submenu-panel="true"]'),
    ).toBeNull();
  });
});
