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

describe("ChatSidebar MarkdownRenderer blockquote", () => {
  it("应复用 Editor 的 blockquote 视觉结构", async () => {
    const { root, container } = await mount(
      <MarkdownProvider isDark={false} isVisible={true}>
        <MarkdownRenderer
          content={"> 第一行引用\n>\n> 第二行引用"}
          markdownComponents={{}}
          shouldRender={true}
        />
      </MarkdownProvider>
    );

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).toBeTruthy();
    expect(blockquote?.className).toContain("pl-[1.5em]");
    expect(blockquote?.className).toContain("italic");
    expect(blockquote?.className).toContain("leading-relaxed");
    const accentBar = blockquote?.querySelector(
      ".absolute.left-0.top-1.bottom-1.w-1.rounded-full.select-none"
    ) as HTMLElement | null;
    expect(accentBar).toBeTruthy();
    expect(accentBar?.style.backgroundColor).toBeTruthy();
    expect(blockquote?.textContent).toContain("第一行引用");
    expect(blockquote?.textContent).toContain("第二行引用");

    await unmount(root, container);
  });
});
