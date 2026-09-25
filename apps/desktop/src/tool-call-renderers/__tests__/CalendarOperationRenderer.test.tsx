import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarOperationRenderer from "../CalendarOperationRenderer";
import type { ToolCallExecutionState } from "@/types";

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {}
): ToolCallExecutionState => ({
  toolCallId: "calendar-op-call-1",
  toolName: "create_calendar_event",
  status: "success",
  input: "{}",
  output: JSON.stringify({
    kind: "calendar-mutation-result",
    success: true,
    entityType: "calendar-event",
    action: "create-event",
    message: "已创建日历事件。",
    data: {
      id: 1,
      title: "和设计团队对齐排期",
      calendarId: 2,
      calendarTitle: "工作安排",
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

describe("CalendarOperationRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("能展示日历 mutation 结果卡片", async () => {
    const { root, container } = await mount(
      <CalendarOperationRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={{}}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("已创建日历事件");
    expect(container.textContent).toContain("对象：和设计团队对齐排期");
    expect(container.textContent).toContain("所属日历：工作安排");

    await unmount(root, container);
  });
});
