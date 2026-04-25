import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import MarkdownRenderer from "../MarkdownRenderer";
import { MarkdownProvider } from "../MarkdownContext";
import styles from "../MarkdownRenderer.module.less";

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

describe("ChatSidebar MarkdownRenderer code block spacing", () => {
  it("应移除默认 pre 包裹并提供独立的代码块间距容器", async () => {
    const { root, container } = await mount(
      <MarkdownProvider isDark={false} isVisible={true}>
        <MarkdownRenderer
          content={"```ts\nconst a = 1;\n```\n\n你怎么了"}
          markdownComponents={{
            code: ({ className, children }: any) => (
              <div data-testid="code-block" className={className}>
                {children}
              </div>
            ),
          }}
          shouldRender={true}
        />
      </MarkdownProvider>,
    );

    const codeBlock = container.querySelector(
      '[data-testid="code-block"]',
    ) as HTMLElement | null;
    const spacingWrapper = container.querySelector(
      '[data-markdown-pre="true"]',
    ) as HTMLElement | null;

    expect(codeBlock).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
    expect(spacingWrapper).toBeTruthy();
    expect(spacingWrapper?.className).toContain(styles.markdownPre);
    expect(container.textContent).toContain("const a = 1;");
    expect(container.textContent).toContain("你怎么了");

    await unmount(root, container);
  });
});
