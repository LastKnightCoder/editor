import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ToolCallExecutionState } from "@/types";
import {
  registerToolCallRenderer,
  unregisterToolCallRenderer,
} from "@/tool-call-renderers";
import type { ToolCallCustomRendererProps } from "@/tool-call-renderers";
import ToolCallDisplay from "../ToolCallDisplay";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {},
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
      <ToolCallDisplay execution={execution} isDark={false} />,
    );

    expect(container.textContent).toContain(execution.toolName);
    expect(container.textContent).toContain("Completed");

    await unmount(root, container);
  });

  it("命中自定义渲染器时应透传解析后的参数", async () => {
    const execution = createExecution({
      toolName: "tool_with_custom_renderer",
      input: '{"user":"alice","age":18}',
    });
    let receivedProps: unknown = null;

    registerToolCallRenderer(
      execution.toolName,
      (props: ToolCallCustomRendererProps) => {
        receivedProps = props;
        return <div data-testid="custom-renderer">custom renderer</div>;
      },
    );
    const { root, container } = await mount(
      <ToolCallDisplay execution={execution} isDark={false} />,
    );

    expect(
      container.querySelector('[data-testid="custom-renderer"]'),
    ).toBeTruthy();
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

    registerToolCallRenderer(
      execution.toolName,
      (props: ToolCallCustomRendererProps) => {
        receivedProps = props;
        return <div data-testid="custom-renderer-bad-json">bad json</div>;
      },
    );

    const { root, container } = await mount(
      <ToolCallDisplay execution={execution} isDark={false} />,
    );

    expect(
      container.querySelector('[data-testid="custom-renderer-bad-json"]'),
    ).toBeTruthy();
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
      <ToolCallDisplay execution={execution} isDark={false} />,
    );

    expect(container.textContent).toContain(execution.toolName);
    expect(container.textContent).toContain("Completed");

    await unmount(root, container);
    consoleSpy.mockRestore();
    unregisterToolCallRenderer(execution.toolName);
  });
});
