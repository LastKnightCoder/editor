import { describe, expect, it } from "vitest";
import { getToolCallRenderer as getChatToolCallRenderer } from "@tau/chat-ui/renderers";
import type { ToolCallCustomRenderer } from "../types";
import {
  getToolCallRenderer,
  registerToolCallRenderer,
  unregisterToolCallRenderer,
} from "../registry";

const createRenderer = (): ToolCallCustomRenderer => {
  return () => null;
};

describe("tool-call-renderers/registry", () => {
  it("桌面入口与聊天展示使用同一登记表", () => {
    const toolName = "registry_test_shared_bridge_tool";
    const renderer = createRenderer();

    registerToolCallRenderer(toolName, renderer);

    expect(getToolCallRenderer(toolName)).toBe(renderer);
    expect(getChatToolCallRenderer(toolName)).toBe(renderer);

    unregisterToolCallRenderer(toolName);
  });
});
