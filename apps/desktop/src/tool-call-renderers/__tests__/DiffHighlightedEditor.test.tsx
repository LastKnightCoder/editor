import { act } from "react";
import type { ComponentType, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiffHighlightedEditor } from "../DiffHighlightedEditor";

let mockLeaf: Record<string, unknown> = { text: "x", diffType: "replace" };

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
vi.mock("@tau/editor", () => ({
  Editor: ({
    leafWrapper: Wrapper,
  }: {
    leafWrapper: ComponentType<{
      children: ReactNode;
      leaf: Record<string, unknown>;
    }>;
  }) => (
    <div data-testid="editor-root">
      <span data-slate-leaf="true">
        <Wrapper leaf={mockLeaf}>
          <strong data-testid="formatted-children">x</strong>
        </Wrapper>
      </span>
    </div>
  ),
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

describe("DiffHighlightedEditor", () => {
  afterEach(() => {
    mockLeaf = { text: "x", diffType: "replace" };
  });

  it("应将 Slate attributes 保留在最外层 leaf 节点", async () => {
    const { root, container } = await mount(<DiffHighlightedEditor content={[]} isDark={false} />);

    const editorRoot = container.querySelector('[data-testid="editor-root"]') as HTMLElement;
    const outerLeaf = container.querySelector('[data-slate-leaf="true"]') as HTMLElement;

    expect(outerLeaf).toBeTruthy();
    expect(outerLeaf.parentElement).toBe(editorRoot);

    await unmount(root, container);
  });

  it("删除外观包装保留已完成格式组合的内容，不接管 Slate 属性", async () => {
    mockLeaf = {
      text: "x",
      diffType: "delete",
      diffId: "delete-1",
    };

    const { root, container } = await mount(<DiffHighlightedEditor content={[]} isDark={false} />);

    const outerLeaf = container.querySelector('[data-slate-leaf="true"]') as HTMLElement;

    const wrapper = outerLeaf.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("line-through");
    expect(wrapper.getAttribute("title")).toBe("变更：delete-1");
    expect(wrapper.querySelector('[data-testid="formatted-children"]')?.textContent).toBe("x");
    expect(wrapper.hasAttribute("data-slate-leaf")).toBe(false);
    expect(outerLeaf.getAttribute("data-slate-leaf")).toBe("true");

    await unmount(root, container);
  });
});
