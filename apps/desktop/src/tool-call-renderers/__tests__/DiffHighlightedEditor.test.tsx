import { act } from "react";
import type { HTMLAttributes, ReactNode } from "react";
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
    wrapperProps,
  }: {
    attributes: Record<string, string>;
    children: ReactNode;
    wrapperProps?: HTMLAttributes<HTMLSpanElement>;
  }) => (
    <span data-testid="formatted-text" {...attributes} {...wrapperProps}>
      {children}
    </span>
  ),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
    const { root, container } = await mount(
      <DiffHighlightedEditor
        content={[]}
        patches={[]}
        positionMapper={{} as never}
        lineOffsets={[0]}
        proposalMarkdownLength={1}
        isDark={false}
      />,
    );

    const editorRoot = container.querySelector(
      '[data-testid="editor-root"]',
    ) as HTMLElement;
    const formattedText = container.querySelector(
      '[data-testid="formatted-text"]',
    ) as HTMLElement;

    expect(formattedText).toBeTruthy();
    expect(formattedText.getAttribute("data-slate-leaf")).toBe("true");
    expect(formattedText.className).toContain("bg-yellow-50");
    expect(formattedText.parentElement).toBe(editorRoot);

    await unmount(root, container);
  });

  it("应将删除提示透传给最外层 leaf 节点", async () => {
    mockLeaf = {
      text: "x",
      diffType: "delete",
      deletedText: "old",
      deletionAnchor: "before",
    };

    const { root, container } = await mount(
      <DiffHighlightedEditor
        content={[]}
        patches={[]}
        positionMapper={{} as never}
        lineOffsets={[0]}
        proposalMarkdownLength={1}
        isDark={false}
      />,
    );

    const formattedText = container.querySelector(
      '[data-testid="formatted-text"]',
    ) as HTMLElement;

    expect(formattedText.className).toContain("border-l-2");
    expect(formattedText.getAttribute("title")).toBe("已删除内容：old");
    expect(formattedText.getAttribute("data-slate-leaf")).toBe("true");

    await unmount(root, container);
  });
});
