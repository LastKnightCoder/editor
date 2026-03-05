import { describe, expect, it } from "vitest";
import { getToolCallRenderer as getSharedToolCallRenderer } from "@tau/shared";
import type { ToolCallCustomRenderer } from "../types";
import {
  getToolCallRenderer,
  registerToolCallRenderer,
  registerToolCallRenderers,
  unregisterToolCallRenderer,
} from "../registry";

const createRenderer = (): ToolCallCustomRenderer => {
  return () => null;
};

describe("tool-call-renderers/registry", () => {
  it("应该支持注册与读取单个渲染器", () => {
    const toolName = "registry_test_single_tool";
    const renderer = createRenderer();

    registerToolCallRenderer(toolName, renderer);

    expect(getToolCallRenderer(toolName)).toBe(renderer);
    unregisterToolCallRenderer(toolName);
  });

  it("同名工具应允许覆盖注册", () => {
    const toolName = "registry_test_override_tool";
    const oldRenderer = createRenderer();
    const nextRenderer = createRenderer();

    registerToolCallRenderer(toolName, oldRenderer);
    registerToolCallRenderer(toolName, nextRenderer);

    expect(getToolCallRenderer(toolName)).toBe(nextRenderer);
    unregisterToolCallRenderer(toolName);
  });

  it("应该支持批量注册", () => {
    const toolA = "registry_test_batch_tool_a";
    const toolB = "registry_test_batch_tool_b";
    const rendererA = createRenderer();
    const rendererB = createRenderer();

    registerToolCallRenderers([
      { toolName: toolA, renderer: rendererA },
      { toolName: toolB, renderer: rendererB },
    ]);

    expect(getToolCallRenderer(toolA)).toBe(rendererA);
    expect(getToolCallRenderer(toolB)).toBe(rendererB);

    unregisterToolCallRenderer(toolA);
    unregisterToolCallRenderer(toolB);
  });

  it("注销后应该无法再获取渲染器", () => {
    const toolName = "registry_test_unregister_tool";
    const renderer = createRenderer();

    registerToolCallRenderer(toolName, renderer);
    expect(unregisterToolCallRenderer(toolName)).toBe(true);
    expect(getToolCallRenderer(toolName)).toBeUndefined();
  });

  it("桌面注册中心应与 shared 注册中心保持一致", () => {
    const toolName = "registry_test_shared_bridge_tool";
    const renderer = createRenderer();

    registerToolCallRenderer(toolName, renderer);

    expect(getToolCallRenderer(toolName)).toBe(renderer);
    expect(getSharedToolCallRenderer(toolName)).toBe(renderer);

    unregisterToolCallRenderer(toolName);
  });
});
