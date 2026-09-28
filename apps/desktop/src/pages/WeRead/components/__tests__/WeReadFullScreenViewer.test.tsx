import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeReadFullScreenViewer } from "../WeReadFullScreenViewer";

// 宿主组件只验证自身逻辑，不渲染真实编辑器，kit 也不必真实构造
vi.mock("@/services/editorKit", () => ({
  createDesktopKit: () => ({}),
  getContentKit: () => ({}),
  getDescriptionKit: () => ({}),
  getMarkdownFileKit: () => ({}),
  getSkillFileKit: () => ({}),
  getFlashcardKit: () => ({}),
  getArrowLabelKit: () => ({}),
}));
vi.mock("@tau/editor/src", () => ({
  Editor: ({ initValue }: { initValue: unknown }) => (
    <div data-testid="mock-editor">{JSON.stringify(initValue)}</div>
  ),
}));

vi.mock("../../extensions", () => ({ getWeReadKit: () => ({}) }));

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    cardBgClass: "bg-white",
    cardBorderClass: "border-slate-200",
    hoverClass: "hover:bg-slate-100",
    activeTextClass: "text-slate-900",
  }),
}));

vi.mock("@/hooks/useBackgroundMode", () => ({
  default: () => ({
    accent: "indigo",
  }),
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

describe("WeReadFullScreenViewer", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("应给全屏详情页预留顶部 titlebar 空间", async () => {
    const { root, container } = await mount(
      <WeReadFullScreenViewer
        open={true}
        row={{ id: "row-1", title: "测试笔记" }}
        content={null}
        onClose={() => {}}
      />
    );

    const viewer = container.querySelector('[data-testid="weread-fullscreen-viewer"]');

    expect(viewer).not.toBeNull();
    expect((viewer as HTMLElement | null)?.style.top).toBe("var(--title-bar-height, 48px)");
    expect(viewer?.className).toContain("bottom-0");

    await unmount(root, container);
  });
});
