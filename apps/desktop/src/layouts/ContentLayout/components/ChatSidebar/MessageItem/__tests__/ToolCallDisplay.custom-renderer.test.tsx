import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ToolCallExecutionState } from "@/types";
import { registerToolCallRenderer, unregisterToolCallRenderer } from "@/tool-call-renderers";
import type { ToolCallCustomRendererProps } from "@/tool-call-renderers";
import ToolCallDisplay from "../ToolCallDisplay";

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {}
): ToolCallExecutionState => ({
  toolCallId: "call-test-1",
  toolName: "test_tool",
  status: "success",
  input: '{"name":"tau"}',
  output: "ok",
  timestamp: Date.now(),
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

describe("MessageItem/ToolCallDisplay custom renderer", () => {
  it("未注册渲染器时应使用默认样式", async () => {
    const execution = createExecution({
      toolName: "tool_without_custom_renderer",
    });
    unregisterToolCallRenderer(execution.toolName);

    const { root, container } = await mount(
      <ToolCallDisplay execution={execution} isDark={false} />
    );

    expect(container.textContent).toContain(execution.toolName);
    expect(container.textContent).toContain("完成");

    await unmount(root, container);
  });

  it("命中自定义渲染器时应透传解析后的参数", async () => {
    const execution = createExecution({
      toolName: "tool_with_custom_renderer",
      input: '{"user":"alice","age":18}',
    });
    let receivedProps: unknown = null;

    registerToolCallRenderer(execution.toolName, (props: ToolCallCustomRendererProps) => {
      receivedProps = props;
      return <div data-testid="custom-renderer">custom renderer</div>;
    });
    const { root, container } = await mount(
      <ToolCallDisplay execution={execution} isDark={false} />
    );

    expect(container.querySelector('[data-testid="custom-renderer"]')).toBeTruthy();
    const capturedProps = receivedProps as ToolCallCustomRendererProps;
    expect(capturedProps.parsedInput).toEqual({
      user: "alice",
      age: 18,
    });
    expect(capturedProps.inputParseError).toBeUndefined();

    await unmount(root, container);
    unregisterToolCallRenderer(execution.toolName);
  });

  it("参数 JSON 非法时应提供 inputParseError", async () => {
    const execution = createExecution({
      toolName: "tool_with_bad_json",
      input: "{ bad json }",
    });
    let receivedProps: unknown = null;

    registerToolCallRenderer(execution.toolName, (props: ToolCallCustomRendererProps) => {
      receivedProps = props;
      return <div data-testid="custom-renderer-bad-json">bad json</div>;
    });

    const { root, container } = await mount(
      <ToolCallDisplay execution={execution} isDark={false} />
    );

    expect(container.querySelector('[data-testid="custom-renderer-bad-json"]')).toBeTruthy();
    const capturedProps = receivedProps as ToolCallCustomRendererProps;
    expect(capturedProps.parsedInput).toBeNull();
    expect(capturedProps.inputParseError).toBeTruthy();

    await unmount(root, container);
    unregisterToolCallRenderer(execution.toolName);
  });

  it("自定义渲染器抛错时应回退默认样式", async () => {
    const execution = createExecution({
      toolName: "tool_renderer_throwing_error",
      output: "fallback-output",
    });

    registerToolCallRenderer(execution.toolName, () => {
      throw new Error("custom renderer crash");
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { root, container } = await mount(
      <ToolCallDisplay execution={execution} isDark={false} />
    );

    expect(container.textContent).toContain(execution.toolName);
    expect(container.textContent).toContain("完成");

    await unmount(root, container);
    consoleSpy.mockRestore();
    unregisterToolCallRenderer(execution.toolName);
  });

  it("metadata.render.rendererKey 应优先于 toolName 命中渲染器", async () => {
    const execution = createExecution({
      toolName: "tool_name_renderer",
      metadata: {
        render: {
          rendererKey: "renderer_key_renderer",
          version: 1,
        },
      },
    });

    registerToolCallRenderer(execution.toolName, () => {
      return <div data-testid="tool-name-renderer">tool-name</div>;
    });
    registerToolCallRenderer("renderer_key_renderer", () => {
      return <div data-testid="renderer-key-renderer">renderer-key</div>;
    });

    const { root, container } = await mount(
      <ToolCallDisplay execution={execution} isDark={false} />
    );

    expect(container.querySelector('[data-testid="renderer-key-renderer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tool-name-renderer"]')).toBeFalsy();

    await unmount(root, container);
    unregisterToolCallRenderer(execution.toolName);
    unregisterToolCallRenderer("renderer_key_renderer");
  });
});

describe("退役代理工具只读展示", () => {
  it.each(["mcp_tool_call", "command_execution"])(
    "%s 统一走通用展示且保留历史输入输出",
    async itemType => {
      const execution = createExecution({
        toolName: itemType === "command_execution" ? "codex.command_execution" : "retired_write",
        status: "failed",
        output: "历史输出",
        metadata: {
          codexItemType: itemType,
          render: {
            rendererKey:
              itemType === "command_execution" ? "codex.command_execution" : "retired_write",
          },
        },
      });
      const renderer = vi.fn(() => <button>执行修改</button>);
      registerToolCallRenderer(execution.toolName, renderer);
      const { root, container } = await mount(
        <ToolCallDisplay execution={execution} isDark={false} />
      );
      expect(renderer).not.toHaveBeenCalled();
      expect(container.textContent).toContain("历史输出");
      expect(container.textContent).not.toContain("执行修改");
      await unmount(root, container);
      unregisterToolCallRenderer(execution.toolName);
    }
  );
});
