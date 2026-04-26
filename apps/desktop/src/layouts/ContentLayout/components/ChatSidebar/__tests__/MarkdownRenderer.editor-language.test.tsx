import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import MarkdownRenderer from "../MarkdownRenderer";
import { MarkdownProvider } from "../MarkdownContext";

vi.mock("@/commands", () => ({
  getProjectItemById: vi.fn(),
  getRootDocumentsByDocumentItemId: vi.fn(),
}));

vi.mock("@/commands/diary", () => ({
  getDiaryEntryById: vi.fn(),
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

describe("ChatSidebar MarkdownRenderer editor language", () => {
  it("应让 hr、ul、ol 贴近 Editor 的视觉结构", async () => {
    const { root, container } = await mount(
      <MarkdownProvider isDark={false} isVisible={true}>
        <MarkdownRenderer
          content={"- 第一项\n- 第二项\n\n---\n\n1. 第一条\n2. 第二条"}
          markdownComponents={{}}
          shouldRender={true}
        />
      </MarkdownProvider>,
    );

    const unorderedList = container.querySelector("ul");
    const orderedList = container.querySelector("ol");
    const items = container.querySelectorAll("li");
    const hr = container.querySelector("hr");

    expect(unorderedList?.className).toContain("bulletedList");
    expect(orderedList?.className).toContain("numberedList");
    expect(items[0]?.className).toContain("listItem");
    expect(hr?.className).toContain("markdownHr");
    expect(container.textContent).toContain("第一项");
    expect(container.textContent).toContain("第二条");

    await unmount(root, container);
  });
});
