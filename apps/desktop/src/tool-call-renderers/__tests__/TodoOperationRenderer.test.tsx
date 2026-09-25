import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TodoOperationRenderer from "../TodoOperationRenderer";
import type { ToolCallExecutionState } from "@/types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {}
): ToolCallExecutionState => ({
  toolCallId: "todo-op-call-1",
  toolName: "toggle_todo_complete",
  status: "success",
  input: "{}",
  output: JSON.stringify({
    success: true,
    event: {
      action: "complete-item",
      entityType: "item",
      entityId: 1,
      groupId: 100,
      relatedItemId: 1,
    },
    data: {
      id: 1,
      title: "研究如何补缴社保",
      groupTitle: "待处理事项",
    },
  }),
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

describe("TodoOperationRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("能以结果卡片展示 mutation 工具结果", async () => {
    const { root, container } = await mount(
      <TodoOperationRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={{}}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("已标记完成");
    expect(container.textContent).toContain("关联对象：研究如何补缴社保");
    expect(container.textContent).toContain("所属分组：待处理事项");

    await unmount(root, container);
  });
});
