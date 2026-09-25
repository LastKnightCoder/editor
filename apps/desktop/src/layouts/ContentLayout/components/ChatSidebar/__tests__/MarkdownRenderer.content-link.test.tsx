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

describe("ChatSidebar MarkdownRenderer content-link", () => {
  it("应将 content-link 指令渲染为行内引用节点", async () => {
    const { root, container } = await mount(
      <MarkdownProvider isDark={false} isVisible={true}>
        <MarkdownRenderer
          content={
            '请阅读 :content-link[测试卡片]{refId=42 contentId=301 contentType=card title="测试卡片"} 后回答'
          }
          markdownComponents={{
            span: ({ children, className }: { children?: ReactNode; className?: string }) => (
              <span className={className}>{children}</span>
            ),
          }}
          shouldRender={true}
        />
      </MarkdownProvider>
    );

    const reference = container.querySelector(".document-reference");
    expect(reference).toBeTruthy();
    expect(reference?.textContent).toBe("测试卡片");
    expect(container.textContent).toContain("请阅读");
    expect(container.textContent).toContain("测试卡片");
    expect(container.textContent).toContain("后回答");

    await unmount(root, container);
  });
});
