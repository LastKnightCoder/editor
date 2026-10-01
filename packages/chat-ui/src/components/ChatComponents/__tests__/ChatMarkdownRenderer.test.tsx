import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import ChatMarkdownRenderer from "../ChatMarkdownRenderer";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mount = async (node: React.ReactNode) => {
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

describe("ChatMarkdownRenderer", () => {
  it("迁出共享根入口后仍保留行内与块级数学渲染", async () => {
    const { root, container } = await mount(
      <ChatMarkdownRenderer content={"行内 $x^2$\n\n$$\ny^2\n$$"} />
    );
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    await unmount(root, container);
  });
  it("渲染基础 Markdown 元素", async () => {
    const { root, container } = await mount(
      <ChatMarkdownRenderer
        content={[
          "# 标题",
          "",
          "- 列表",
          "",
          "> 引用",
          "",
          "`inline`",
          "",
          "| A |",
          "| - |",
          "| B |",
        ].join("\n")}
      />
    );

    expect(container.querySelector("h1")?.textContent).toBe("标题");
    expect(container.querySelector("li")?.textContent).toBe("列表");
    expect(container.querySelector("blockquote")?.textContent).toContain("引用");
    expect(container.querySelector("code")?.textContent).toBe("inline");
    expect(container.querySelector("table")).toBeTruthy();

    await unmount(root, container);
  });

  it("可预览代码块渲染 preview card 并触发回调", async () => {
    const onPreviewCodeBlock = vi.fn();
    const { root, container } = await mount(
      <ChatMarkdownRenderer
        content={[
          "```html",
          "<!DOCTYPE html><html><head><title>Demo</title></head></html>",
          "```",
        ].join("\n")}
        onPreviewCodeBlock={onPreviewCodeBlock}
      />
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toContain("Demo");

    await act(async () => {
      button.click();
    });

    expect(onPreviewCodeBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "html",
        content: "<!DOCTYPE html><html><head><title>Demo</title></head></html>",
      })
    );

    await unmount(root, container);
  });
});
