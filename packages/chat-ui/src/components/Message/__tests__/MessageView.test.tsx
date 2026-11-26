import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { ReasoningBlock } from "../ReasoningBlock";
import { ToolCallRow } from "../ToolCallRow";
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

  it("额外动作收到消息纯文本，排在删除之前", async () => {
    const renderExtra = vi.fn((text: string) => <button type="button">插件：{text}</button>);
    const { root, container } = await mount(
      <MessageView
        {...renderers}
        role="assistant"
        messageIndex={0}
        assistantBlocks={[{ type: "text", content: "重排会触发回流" }]}
        renderExtraActions={renderExtra}
        onDelete={vi.fn()}
      />
    );

    expect(renderExtra).toHaveBeenCalledWith("重排会触发回流");
    const labels = [...container.querySelectorAll("button")].map(
      button => button.getAttribute("aria-label") ?? button.textContent
    );
    expect(labels.indexOf("插件：重排会触发回流")).toBeLessThan(labels.indexOf("删除"));

    await unmount(root, container);
  });
  it("触屏宿主可隐藏悬停操作行，并整组渲染相邻工具调用", async () => {
    const execution = (toolCallId: string, toolName: string) => ({
      toolCallId,
      toolName,
      status: "success" as const,
      input: "{}",
      timestamp: 0,
    });
    const renderToolGroup = vi.fn((executions: { toolName: string }[]) => (
      <span>组：{executions.map(item => item.toolName).join("+")}</span>
    ));
    const { root, container } = await mount(
      <MessageView
        {...renderers}
        role="assistant"
        messageIndex={1}
        hideActions
        renderToolGroup={renderToolGroup}
        onDelete={vi.fn()}
        assistantBlocks={[
          { type: "tool_calls", executions: [execution("a", "查日程")] },
          { type: "tool_calls", executions: [execution("b", "查待办")] },
          { type: "text", content: "明天没有安排" },
        ]}
      />
    );

    expect(container.textContent).toContain("组：查日程+查待办");
    expect(renderToolGroup).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button[aria-label="复制"]')).toBeNull();
    expect(container.querySelector('button[aria-label="删除"]')).toBeNull();

    await unmount(root, container);
  });
});

it("换语保留思考计时、已展开正文与工具折叠状态", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000);
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { root, container } = await mount(
    <I18nRuntimeProvider runtime={runtime}>
      <ReasoningBlock startTime={1_000}>
        <span data-raw-reasoning>原始推理内容</span>
      </ReasoningBlock>
      <ToolCallRow
        execution={{
          toolCallId: "failed",
          toolName: "raw_tool",
          status: "failed",
          input: "{raw}",
          error: "raw failure",
          timestamp: 1,
        }}
      />
    </I18nRuntimeProvider>
  );
  try {
    const [reasoning, tool] = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")
    );
    await act(async () => {
      reasoning.click();
      tool.click();
    });
    const raw = container.querySelector("[data-raw-reasoning]");
    expect(raw?.textContent).toBe("原始推理内容");
    expect(tool.getAttribute("aria-expanded")).toBe("false");
    const timers = vi.getTimerCount();
    const firstTitle = reasoning.textContent;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => source.setLocale(locale));
      expect(container.querySelector("[data-raw-reasoning]")).toBe(raw);
      expect(container.querySelector("button[aria-expanded]")).toBe(reasoning);
      expect(reasoning.getAttribute("aria-expanded")).toBe("true");
      expect(tool.getAttribute("aria-expanded")).toBe("false");
      expect(vi.getTimerCount()).toBe(timers);
    }
    await act(async () => vi.advanceTimersByTime(500));
    expect(reasoning.textContent).not.toBe(firstTitle);
    expect(raw?.textContent).toBe("原始推理内容");
  } finally {
    await unmount(root, container);
    runtime.dispose();
    vi.useRealTimers();
  }
});
