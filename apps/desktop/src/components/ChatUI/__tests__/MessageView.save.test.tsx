/**
 * 助手回答的「存为…」（KL-024）：只有助手回答且有正文时出现；菜单项回调存为卡片 / 文章 / 生成闪卡，
 * 传出的只是最终文本，不含思考与工具调用。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentBlock } from "@tau/shared";
import { answerArticleTitle } from "@/services/save-chat-answer";
import { MessageView, type MessageViewProps } from "../MessageView";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  document.body.innerHTML = "";
});

const BLOCKS = [
  { type: "reasoning", content: "先想一想" },
  { type: "text", content: "## 层叠上下文\n\n第一段" },
  { type: "tool_calls", executions: [] },
  { type: "text", content: "第二段" },
] as unknown as ContentBlock[];

const render = async (props: Partial<MessageViewProps>) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <MessageView
        role="assistant"
        messageIndex={5}
        assistantBlocks={BLOCKS}
        renderMarkdown={({ content }) => <span>{content}</span>}
        renderImage={() => null}
        renderToolCall={() => null}
        {...props}
      />
    );
  });
  return container;
};

const menuItem = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item =>
    item.textContent?.includes(text)
  );

describe("MessageView 存为", () => {
  it("菜单三项回调最终文本（不含思考）", async () => {
    const onSaveAs = vi.fn();
    const container = await render({ onSaveAs });
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="存为"]')!;
    for (const [label, target] of [
      ["存为卡片", "card"],
      ["存为文章", "article"],
      ["生成闪卡", "flashcards"],
    ] as const) {
      await act(async () => trigger.click());
      await act(async () => menuItem(label)!.click());
      expect(onSaveAs).toHaveBeenLastCalledWith(5, target, "## 层叠上下文\n\n第一段\n\n第二段");
    }
  });

  it("用户消息、没有回调或没有正文时不显示", async () => {
    const onSaveAs = vi.fn();
    expect(
      (await render({ role: "user", userText: "问题", onSaveAs })).querySelector(
        'button[aria-label="存为"]'
      )
    ).toBeNull();
    expect((await render({})).querySelector('button[aria-label="存为"]')).toBeNull();
    expect(
      (
        await render({
          onSaveAs,
          assistantBlocks: [{ type: "reasoning", content: "只有思考" }] as unknown as ContentBlock[],
        })
      ).querySelector('button[aria-label="存为"]')
    ).toBeNull();
  });
});

describe("answerArticleTitle", () => {
  it("取第一个标题，没有则用对话标题", () => {
    expect(answerArticleTitle("前言\n\n### 重排与重绘 ##\n\n## 其次", "对话")).toBe("重排与重绘");
    expect(answerArticleTitle("没有标题", "层叠上下文")).toBe("层叠上下文");
    expect(answerArticleTitle("没有标题", " ")).toBe("对话摘录");
  });
});
