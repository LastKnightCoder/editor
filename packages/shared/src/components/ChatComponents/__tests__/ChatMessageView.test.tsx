import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import ChatMessageView from "../ChatMessageView";
import type { ContentBlock } from "../types";

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

describe("ChatMessageView", () => {
  it("渲染用户文本、图片和文件", async () => {
    const { root, container } = await mount(
      <ChatMessageView
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
      <ChatMessageView
        role="assistant"
        messageIndex={1}
        assistantBlocks={blocks}
        renderMarkdown={({ content }) => <span>{content}</span>}
      />
    );

    expect(container.textContent).toContain("第一段");
    expect(container.textContent).toContain("已思考");
    expect(container.textContent).toContain("search");
    expect(container.textContent).toContain("第二段");

    await unmount(root, container);
  });

  it("根据角色显示对应操作按钮", async () => {
    const { root, container } = await mount(
      <ChatMessageView
        role="user"
        messageIndex={2}
        userText="可编辑"
        onEditUserMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(container.querySelector('button[title="编辑"]')).toBeTruthy();
    expect(container.querySelector('button[title="重新生成"]')).toBeTruthy();
    expect(container.querySelector('button[title="创建分支"]')).toBeNull();

    await unmount(root, container);
  });
});

describe("ChatMessageView 版本切换（M4-d 会话树）", () => {
  it("有多个版本时常显 ‹ i/n ›，首尾按钮禁用，点击回调目标版本", async () => {
    const onSwitchVersion = vi.fn();
    const { root, container } = await mount(
      <ChatMessageView
        role="user"
        messageIndex={2}
        userText="问题"
        versions={{ index: 0, count: 3 }}
        onSwitchVersion={onSwitchVersion}
      />
    );

    const group = container.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("版本 1 / 3");
    expect(group.textContent).toContain("1/3");
    const prev = container.querySelector<HTMLButtonElement>('button[aria-label="上一个版本"]')!;
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="下一个版本"]')!;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    await act(async () => next.click());
    expect(onSwitchVersion).toHaveBeenCalledWith(2, 1);

    await unmount(root, container);
  });

  it("只有一个版本、或是助手消息时不显示；没有回调（运行中）时按钮禁用", async () => {
    const single = await mount(
      <ChatMessageView
        role="user"
        messageIndex={0}
        userText="q"
        versions={{ index: 0, count: 1 }}
      />
    );
    expect(single.container.querySelector('[role="group"]')).toBeNull();
    await unmount(single.root, single.container);

    const busy = await mount(
      <ChatMessageView
        role="user"
        messageIndex={0}
        userText="q"
        versions={{ index: 1, count: 2 }}
      />
    );
    const buttons = busy.container.querySelectorAll<HTMLButtonElement>('[role="group"] button');
    expect([...buttons].every(button => button.disabled)).toBe(true);
    await unmount(busy.root, busy.container);
  });
});
