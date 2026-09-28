/**
 * 桌面消息视图的版本切换（M4-d 会话树）：有多个版本时常显 ‹ i/n ›，首尾禁用，
 * 点击回调目标版本；没有回调（回答进行中）时禁用；助手消息与单版本不显示。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageView, type MessageViewProps } from "../MessageView";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

const render = async (props: Partial<MessageViewProps>) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <MessageView
        role="user"
        messageIndex={3}
        userText="问题"
        renderMarkdown={({ content }) => <span>{content}</span>}
        renderImage={() => null}
        renderToolCall={() => null}
        {...props}
      />
    );
  });
  return container;
};

describe("MessageView 版本切换", () => {
  it("空失败显示重试，有结果时保留重新生成的名称", async () => {
    const onRegenerate = vi.fn();
    const container = await render({ onRegenerate, regenerateLabel: "重试" });
    const retry = container.querySelector<HTMLButtonElement>('button[aria-label="重试"]');
    await act(async () => retry?.click());
    expect(onRegenerate).toHaveBeenCalledWith(3);
    expect(
      (await render({ onRegenerate })).querySelector('button[aria-label="重新生成"]')
    ).not.toBeNull();
  });

  it("显示 i/n 与可读名称；首个版本的「上一个」禁用；点击回调目标版本", async () => {
    const onSwitchVersion = vi.fn();
    const container = await render({ versions: { index: 0, count: 2 }, onSwitchVersion });

    const group = container.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("版本 1 / 2");
    expect(group.textContent).toContain("1/2");
    const prev = container.querySelector<HTMLButtonElement>('button[aria-label="上一个版本"]')!;
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="下一个版本"]')!;
    expect(prev.disabled).toBe(true);
    await act(async () => next.click());
    expect(onSwitchVersion).toHaveBeenCalledWith(3, 1);
  });

  it("没有回调（回答进行中）时两个按钮都禁用", async () => {
    const container = await render({ versions: { index: 1, count: 3 } });
    const buttons = container.querySelectorAll<HTMLButtonElement>('[role="group"] button');
    expect(buttons).toHaveLength(2);
    expect([...buttons].every(button => button.disabled)).toBe(true);
  });

  it("单版本、助手消息不显示", async () => {
    expect(
      (await render({ versions: { index: 0, count: 1 } })).querySelector('[role="group"]')
    ).toBeNull();
    expect(
      (
        await render({
          role: "assistant",
          userText: "",
          assistantBlocks: [{ type: "text", content: "回答" }],
          versions: { index: 0, count: 2 },
        })
      ).querySelector('[role="group"]')
    ).toBeNull();
  });
});
