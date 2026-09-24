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

describe("ChatSidebar MarkdownRenderer PDF 引用", () => {
  it("应将 pdfref 语法渲染为行内自定义引用节点", async () => {
    const { root, container } = await mount(
      <MarkdownProvider isDark={false} isVisible={true}>
        <MarkdownRenderer
          content={"这是结论段落 :pdfref[第12页｜证据摘要]{page=12 charStart=10 charEnd=20}"}
          markdownComponents={{
            span: ({
              children,
              className,
              ...props
            }: {
              children?: ReactNode;
              className?: string;
            } & Record<string, unknown>) => (
              <span className={className} data-page={String(props["data-page"] || "")}>
                {children}
              </span>
            ),
          }}
          shouldRender={true}
        />
      </MarkdownProvider>
    );

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);

    const citation = container.querySelector('.pdf-citation[data-page="12"]');
    expect(citation).toBeTruthy();
    expect(paragraphs[0]?.textContent).toContain("这是结论段落");
    expect(paragraphs[0]?.textContent).toContain("第12页｜证据摘要");

    await unmount(root, container);
  });
});
