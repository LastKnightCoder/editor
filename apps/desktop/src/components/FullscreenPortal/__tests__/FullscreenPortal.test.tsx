import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import FullscreenPortal from "..";

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("FullscreenPortal", () => {
  it("应给顶部 titlebar 预留空间", async () => {
    const onClose = vi.fn();
    const { root, container } = await mount(
      <FullscreenPortal title="测试预览" onClose={onClose}>
        <div>content</div>
      </FullscreenPortal>
    );

    const overlay = document.querySelector(
      '[data-testid="fullscreen-portal-overlay"]'
    ) as HTMLElement | null;
    const portalContainer = document.querySelector(
      '[data-testid="fullscreen-portal-container"]'
    ) as HTMLElement | null;

    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe("var(--title-bar-height, 48px)");
    expect(portalContainer).not.toBeNull();
    expect(portalContainer?.style.width).toBe("100vw");
    expect(portalContainer?.style.height).toBe("calc(100vh - var(--title-bar-height, 48px))");

    await unmount(root, container);
  });
});
