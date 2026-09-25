import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarQueryRenderer from "../CalendarQueryRenderer";
import type { ToolCallExecutionState } from "@/types";
import * as calendarQueryModule from "@/mcp/calendar/query";
import { emitCalendarMutationEvent } from "@/mcp/calendar/events";

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {}
): ToolCallExecutionState => ({
  toolCallId: "calendar-query-call-1",
  toolName: "query_calendar_events",
  status: "success",
  input: '{"calendarIds":[2],"startDate":"2026-03-01","endDate":"2026-03-31"}',
  output: JSON.stringify({
    kind: "calendar-query-result",
    entityType: "calendar-event",
    summary: {
      totalCount: 2,
      page: 1,
      pageSize: 20,
      hasMore: false,
    },
    items: [
      {
        id: 1,
        title: "和设计团队对齐排期",
        calendarId: 2,
        calendarTitle: "工作安排",
        color: "blue",
        startDate: "2026-03-10",
        endDate: null,
        startTime: 570,
        endTime: 630,
        allDay: false,
        detailPreview: "确认里程碑和负责人",
      },
      {
        id: 2,
        title: "项目复盘",
        calendarId: 2,
        calendarTitle: "工作安排",
        color: "green",
        startDate: "2026-03-18",
        endDate: null,
        startTime: null,
        endTime: null,
        allDay: true,
      },
    ],
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

describe("CalendarQueryRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("能展示事件查询结果卡片", async () => {
    const { root, container } = await mount(
      <CalendarQueryRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={{
          calendarIds: [2],
          startDate: "2026-03-01",
          endDate: "2026-03-31",
        }}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("日历事件查询结果");
    expect(container.textContent).toContain("和设计团队对齐排期");
    expect(container.textContent).toContain("工作安排");
    expect(container.textContent).toContain("2026-03-10");
    expect(container.textContent).toContain("09:30 - 10:30");
    expect(container.textContent).toContain("项目复盘");
    expect(container.textContent).toContain("全天");

    await unmount(root, container);
  });

  it("事件超过 5 条时支持点击展开查看更多", async () => {
    const execution = createExecution({
      output: JSON.stringify({
        kind: "calendar-query-result",
        entityType: "calendar-event",
        summary: {
          totalCount: 6,
          page: 1,
          pageSize: 20,
          hasMore: false,
        },
        items: Array.from({ length: 6 }, (_, index) => ({
          id: index + 1,
          title: `事件 ${index + 1}`,
          calendarId: 2,
          calendarTitle: "工作安排",
          color: "blue",
          startDate: "2026-03-10",
          endDate: null,
          startTime: 540 + index * 30,
          endTime: 570 + index * 30,
          allDay: false,
        })),
      }),
    });

    const { root, container } = await mount(
      <CalendarQueryRenderer
        execution={execution}
        isDark={false}
        parsedInput={{
          calendarIds: [2],
          startDate: "2026-03-01",
          endDate: "2026-03-31",
        }}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("展开剩余 1 条事件");
    expect(container.textContent).not.toContain("事件 6");

    const button = Array.from(container.querySelectorAll("button")).find(item =>
      item.textContent?.includes("展开剩余")
    );

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("事件 6");
    expect(container.textContent).toContain("收起事件列表");

    await unmount(root, container);
  });

  it("详情刷新失败后应显示失效提示而不是保留旧内容", async () => {
    const execution = createExecution({
      toolName: "get_calendar_detail",
      input: '{"id":2}',
      output: JSON.stringify({
        kind: "calendar-detail",
        entityType: "calendar",
        id: 2,
        data: {
          id: 2,
          title: "工作安排",
          color: "blue",
          archived: false,
          pinned: false,
          visible: true,
          markdown: "",
          preview: "",
          recentEvents: [],
        },
      }),
    });

    vi.spyOn(calendarQueryModule, "getCalendarDetail").mockRejectedValue(new Error("NOT_FOUND"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { root, container } = await mount(
      <CalendarQueryRenderer
        execution={execution}
        isDark={false}
        parsedInput={{ id: 2 }}
        renderDefault={() => <div>fallback</div>}
      />
    );

    await act(async () => {
      emitCalendarMutationEvent({
        source: "calendar-mcp",
        entityType: "calendar",
        entityId: 2,
        calendarId: 2,
        action: "delete-calendar",
      });
    });

    expect(container.textContent).toContain("详情已失效");
    expect(container.textContent).toContain("对象已不可用");
    expect(container.textContent).not.toContain("工作安排");

    await unmount(root, container);
    consoleSpy.mockRestore();
  });
});
