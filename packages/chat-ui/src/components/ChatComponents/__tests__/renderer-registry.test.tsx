import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { registerToolCallRenderer, unregisterToolCallRenderer } from "../../../../renderers";
import { ToolCallDisplay } from "../ToolCallDisplay";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("纯登记入口与真实展示共用实例，注销后恢复宿主默认渲染", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const toolName = "chat-registry-display-test";
  const execution: ToolCallExecutionState = {
    toolCallId: "test-call",
    toolName,
    input: "{}",
    status: "success",
    timestamp: 1,
  };
  const render = () =>
    root.render(
      <ToolCallDisplay
        executions={[{ ...execution }]}
        rendererContext={{ label: "宿主上下文" }}
        renderDefaultItem={() => <span>默认结果</span>}
      />
    );
  try {
    registerToolCallRenderer(toolName, ({ rendererContext, renderDefault }) => (
      <div>
        {String(rendererContext?.label)}
        {renderDefault()}
      </div>
    ));
    await act(async () => render());
    expect(host.textContent).toBe("宿主上下文默认结果");
    unregisterToolCallRenderer(toolName);
    await act(async () => render());
    expect(host.textContent).toBe("默认结果");
  } finally {
    unregisterToolCallRenderer(toolName);
    await act(async () => root.unmount());
  }
});
