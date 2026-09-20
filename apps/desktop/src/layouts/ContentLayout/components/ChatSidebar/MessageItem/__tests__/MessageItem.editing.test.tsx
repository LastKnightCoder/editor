import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "antd";
import { describe, expect, it, vi } from "vitest";
import MessageItem from "../index";
import { Role } from "@/constants";
import type { RequestMessage } from "@/types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const createUserMessage = (content: RequestMessage["content"]): RequestMessage => ({
  role: Role.User,
  content,
});

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App>{node}</App>);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("MessageItem 编辑按钮", () => {
  it("提供 onEditMessage 时应显示编辑按钮并回传文本内容", async () => {
    const onEditMessage = vi.fn();
    const { root, container } = await mount(
      <MessageItem
        message={createUserMessage([
          { type: "text", text: "第一行" },
          { type: "text", text: "第二行" },
        ])}
        isDark={false}
        markdownComponents={{}}
        isVisible={true}
        onEditMessage={onEditMessage}
        messageIndex={3}
      />
    );

    const editButton = container.querySelector('button[title="编辑"]') as HTMLButtonElement | null;
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.click();
    });

    expect(onEditMessage).toHaveBeenCalledWith(3, "第一行\n第二行");

    await unmount(root, container);
  });

  it("未提供 onEditMessage 时不应渲染编辑按钮", async () => {
    const { root, container } = await mount(
      <MessageItem
        message={createUserMessage([{ type: "text", text: "普通消息" }])}
        isDark={false}
        markdownComponents={{}}
        isVisible={true}
        messageIndex={0}
      />
    );

    expect(container.querySelector('button[title="编辑"]')).toBeNull();

    await unmount(root, container);
  });
});
