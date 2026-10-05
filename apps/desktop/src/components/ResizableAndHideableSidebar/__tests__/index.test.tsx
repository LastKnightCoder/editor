import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResizableAndHideableSidebar from "../index";

vi.mock("gsap", () => ({
  default: {
    to: vi.fn((_target: unknown, vars?: { onUpdate?: () => void }) => {
      vars?.onUpdate?.();
    }),
  },
}));

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

describe("ResizableAndHideableSidebar", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("打开时不应裁剪内部拖拽热区", async () => {
    const { root, container } = await mount(
      <ResizableAndHideableSidebar width={420} open={true}>
        <div>content</div>
      </ResizableAndHideableSidebar>
    );

    const sidebarRoot = container.firstElementChild as HTMLElement;
    const viewportWrapper = sidebarRoot.firstElementChild as HTMLElement;

    expect(viewportWrapper.className).not.toContain("overflow-hidden");

    await unmount(root, container);
  });

  it("收起时仍应裁剪内容，避免侧栏内容溢出", async () => {
    const { root, container } = await mount(
      <ResizableAndHideableSidebar width={420} open={false}>
        <div>content</div>
      </ResizableAndHideableSidebar>
    );

    const sidebarRoot = container.firstElementChild as HTMLElement;
    const viewportWrapper = sidebarRoot.firstElementChild as HTMLElement;

    expect(viewportWrapper.className).toContain("overflow-hidden");

    await unmount(root, container);
  });

  it("窗口约束变大后应按保存宽度恢复内外层实际宽度", async () => {
    const handleWidthChange = vi.fn();
    const { root, container } = await mount(
      <ResizableAndHideableSidebar
        width={900}
        open={true}
        minWidth={200}
        maxWidth={480}
        onWidthChange={handleWidthChange}
      >
        <div>content</div>
      </ResizableAndHideableSidebar>
    );

    const sidebarRoot = container.firstElementChild as HTMLElement;
    const viewportWrapper = sidebarRoot.firstElementChild as HTMLElement;
    const resizable = viewportWrapper.firstElementChild as HTMLElement;

    expect(sidebarRoot.style.width).toBe("480px");
    expect(resizable.style.width).toBe("480px");
    expect(handleWidthChange).not.toHaveBeenCalledWith(480, 480);

    await act(async () => {
      root.render(
        <ResizableAndHideableSidebar
          width={900}
          open={true}
          minWidth={200}
          maxWidth={900}
          onWidthChange={handleWidthChange}
        >
          <div>content</div>
        </ResizableAndHideableSidebar>
      );
    });

    expect(sidebarRoot.style.width).toBe("900px");
    expect(resizable.style.width).toBe("900px");

    await unmount(root, container);
  });

  it("fillRemaining 时内外层都不锁定宽度，改以 flex 铺满", async () => {
    const { root, container } = await mount(
      <ResizableAndHideableSidebar
        width={420}
        open={true}
        minWidth={280}
        maxWidth={560}
        fillRemaining
      >
        <div>content</div>
      </ResizableAndHideableSidebar>
    );

    const sidebarRoot = container.firstElementChild as HTMLElement;
    const viewportWrapper = sidebarRoot.firstElementChild as HTMLElement;
    const resizable = viewportWrapper.firstElementChild as HTMLElement;

    expect(sidebarRoot.style.width).toBe("");
    expect(sidebarRoot.className).toContain("flex-1");
    expect(sidebarRoot.className).toContain("min-w-0");
    expect(resizable.style.width).toBe("");
    expect(resizable.style.minWidth).toBe("");
    expect(resizable.style.maxWidth).toBe("");

    await unmount(root, container);
  });
});
