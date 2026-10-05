import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MessageView, type MessageViewProps } from "../MessageView";
import type { ContentBlock } from "@tau/shared/chat-renderers";

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

const renderers: Pick<MessageViewProps, "renderMarkdown" | "renderImage" | "renderToolCall"> = {
  renderMarkdown: ({ content }) => <span>{content}</span>,
  renderImage: (image, index, className) => (
    <img key={index} src={image.url} alt={image.alt} className={className} />
  ),
  renderToolCall: execution => <span>{execution.toolName}</span>,
};

describe("MessageView", () => {
  it("渲染用户文本、图片和文件", async () => {
    const { root, container } = await mount(
      <MessageView
        {...renderers}
        role="user"
        messageIndex={0}
        userText="hello"
        images={[{ url: "data:image/png;base64,abc", alt: "preview" }]}
        files={[{ path: "/tmp/a.pdf", name: "a.pdf" }]}
      />
    );

    expect(container.textContent).toContain("hello");
    expect(container.querySelector('img[alt="preview"]')).toBeTruthy();
    expect(container.textContent).toContain("a.pdf");

    await unmount(root, container);
  });

  it("按顺序渲染 assistant blocks 并过滤空内容", async () => {
    const blocks: ContentBlock[] = [
      { type: "text", content: "第一段" },
      { type: "reasoning", content: "思考过程" },
      { type: "text", content: "  " },
      {
        type: "tool_calls",
        executions: [
          {
            toolCallId: "call-1",
            toolName: "search",
            status: "success",
            input: "{}",
            timestamp: Date.now(),
          },
        ],
      },
      { type: "text", content: "第二段" },
    ];

    const { root, container } = await mount(
      <MessageView {...renderers} role="assistant" messageIndex={1} assistantBlocks={blocks} />
    );

    expect(container.textContent).toContain("第一段");
    expect(container.textContent).toContain("思考过程");
    expect(container.textContent).toContain("search");
    expect(container.textContent).toContain("第二段");

    await unmount(root, container);
  });

  it("根据角色显示对应操作按钮", async () => {
    const { root, container } = await mount(
      <MessageView
        {...renderers}
        role="user"
        messageIndex={2}
        userText="可编辑"
        onEditUserMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(container.querySelector('button[aria-label="编辑"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="重新生成"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="从这里创建分支"]')).toBeNull();

    await unmount(root, container);
  });
});
