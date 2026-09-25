import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import MarkdownRenderer from "../MarkdownRenderer";
import { MarkdownProvider } from "../MarkdownContext";

vi.mock("@/commands", () => ({
  getProjectItemById: vi.fn(),
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
  it("引用块使用 tau 引线样式", async () => {
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
    // 引用 = 2px 引线 + 淡墨正文（D-048），不再用斜体与绝对定位 accent 竖条
    expect(blockquote?.className).toContain("border-l-2");
    expect(blockquote?.className).toContain("text-ink-2");
    expect(blockquote?.textContent).toContain("第一行引用");
    expect(blockquote?.textContent).toContain("第二行引用");

    await unmount(root, container);
  });
});
