import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiffHighlightedEditor } from "../DiffHighlightedEditor";

let mockLeaf: Record<string, unknown> = { text: "x", diffType: "replace" };

vi.mock("@tau/editor/src", () => ({
  Editor: ({
    customRenderLeaf,
  }: {
    customRenderLeaf: (props: {
      attributes: Record<string, string>;
      children: ReactNode;
      leaf: Record<string, unknown>;
    }) => ReactNode;
  }) => (
    <div data-testid="editor-root">
      {customRenderLeaf({
        attributes: { "data-slate-leaf": "true" },
        children: <span data-testid="leaf-children">x</span>,
        leaf: mockLeaf,
      })}
    </div>
  ),
}));

vi.mock("@tau/editor/src/components/FormattedText", () => ({
  default: ({
    attributes,
    children,
  }: {
    attributes: Record<string, string>;
    children: ReactNode;
  }) => (
    <span data-testid="formatted-text" {...attributes}>
      {children}
    </span>
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

  it("应将删除样式挂到最外层 leaf 节点", async () => {
    mockLeaf = {
      text: "x",
      diffType: "delete",
      diffId: "delete-1",
    };

    const { root, container } = await mount(<DiffHighlightedEditor content={[]} isDark={false} />);

    const outerLeaf = container.querySelector('[data-slate-leaf="true"]') as HTMLElement;

    expect(outerLeaf.className).toContain("line-through");
    expect(outerLeaf.getAttribute("title")).toBe("变更：delete-1");
    expect(outerLeaf.getAttribute("data-slate-leaf")).toBe("true");

    await unmount(root, container);
  });
});
