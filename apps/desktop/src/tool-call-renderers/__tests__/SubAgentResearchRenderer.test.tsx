import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { subAgentResearchStore } from "@/agent/subagentResearchStore";
import type { ToolCallExecutionState } from "@/types";

import SubAgentResearchRenderer from "../SubAgentResearchRenderer";

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {}
): ToolCallExecutionState => ({
  toolCallId: "subagent-call-1",
  toolName: "subagent_research",
  status: "executing",
  input: "{}",
  timestamp: Date.now(),
  metadata: {
    render: {
      rendererKey: "subagent-research",
      payload: {
        sessionId: "subagent-call-1",
        status: "running",
        tasks: [
          {
            id: "task-1",
            title: "检查工具接口",
            prompt: "查看工具接口\n确认注册链路",
            status: "success",
            progressText: "已读取工具注册逻辑",
            reasoning: "需要先确认工具注册入口，再确认渲染器注册入口。",
            answer: "工具通过 registry 注册。",
            duration: 2300,
            events: [
              {
                time: 1000,
                type: "started",
                message: "不应显示的开始事件",
              },
              {
                time: 1001,
                type: "tool",
                message: "不应显示的工具事件",
              },
              {
                time: 1002,
                type: "text",
                message: "不应显示的流式 token",
              },
            ],
            toolExecutions: [
              {
                toolCallId: "child-tool-1",
                toolName: "query_files",
                status: "success",
                input: '{"query":"tool"}',
                output: "found",
                timestamp: 1001,
              },
            ],
          },
          {
            id: "task-2",
            title: "检查渲染器",
            prompt: "查看渲染器",
            status: "running",
            progressText: "正在检查",
            events: [
              {
                time: 1003,
                type: "started",
                message: "开始调研",
              },
            ],
            toolExecutions: [],
          },
        ],
      },
    },
  },
  ...overrides,
});

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

describe("SubAgentResearchRenderer", () => {
  beforeEach(() => {
    subAgentResearchStore.clear();
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "0px",
    } as unknown as CSSStyleDeclaration);
  });

  it("点击父渲染器后展示 SubAgent 执行详情", async () => {
    const execution = createExecution();
    const { root, container } = await mount(
      <SubAgentResearchRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("SubAgent 调研");
    expect(container.textContent).toContain("检查工具接口");
    expect(container.textContent).toContain("2s");

    const openButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("查看详情")
    );
    expect(openButton).toBeTruthy();
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("SubAgent 执行详情");
    expect(document.body.querySelector("[data-testid='subagent-tabs']")).toBeTruthy();
    expect(document.body.querySelector("[data-testid='subagent-scroll-body']")).toBeTruthy();
    expect(document.body.textContent).toContain("思考过程");
    expect(document.body.querySelector("[data-testid='subagent-prompt']")?.textContent).toBe(
      "查看工具接口\n确认注册链路"
    );
    expect(document.body.textContent).not.toContain("不应显示的开始事件");
    expect(document.body.textContent).not.toContain("不应显示的工具事件");
    expect(document.body.textContent).toContain("query_files");
    expect(document.body.textContent).toContain("工具通过 registry 注册。");
    expect(document.body.textContent).not.toContain("不应显示的流式 token");

    const rendererTab = Array.from(document.body.querySelectorAll('[role="tab"]')).find(tab =>
      tab.textContent?.includes("检查渲染器")
    );
    expect(rendererTab).toBeTruthy();

    await act(async () => {
      rendererTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("正在检查");
    expect(document.body.textContent).toContain("未调用工具。");

    await unmount(root, container);
  });

  it("刷新后仅依赖持久化 metadata 也能渲染详情", async () => {
    subAgentResearchStore.clear();
    const execution = createExecution({
      status: "success",
    });

    const { root, container } = await mount(
      <SubAgentResearchRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    const openButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("查看详情")
    );
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("SubAgent 执行详情");
    expect(document.body.textContent).toContain("工具通过 registry 注册。");
    expect(document.body.textContent).toContain("query_files");

    await unmount(root, container);
  });
});
