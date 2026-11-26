import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { toast } from "@tau/ui";
import type {
  AssistantQueryResult,
  AssistantTask,
  TaskOperationResult,
} from "@tau/shared/task-assistant";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import type { ToolCallExecutionState } from "@/types";

const io = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/commands/task-assistant", () => ({ taskAssistantRequest: io.request }));
import AssistantTaskRenderer from "../AssistantTaskRenderer";

it("换语保留正在提交的任务、查询与原操作身份，已有回执反馈即时换语而不重发", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  queryClient.clear();
  const database = useSettingStore.getState().setting.database.active;
  const task: AssistantTask = {
    taskRef: { kind: "todo", todoId: 21, createdAt: 100 },
    revision: "original-revision",
    title: "原始任务标题",
    completed: false,
    archived: false,
    dueAt: "2026-03-08",
    groupId: null,
    writable: true,
  };
  const data: AssistantQueryResult<AssistantTask> = {
    type: "assistant-tasks",
    databaseName: database,
    items: [task],
    hasMore: false,
    nextCursor: null,
    incomplete: false,
    warnings: ["原始工具警告"],
  };
  const execution = {
    toolCallId: "assistant-original",
    toolName: "query_tasks",
    status: "success",
    input: '{"original":true}',
    timestamp: 1,
    metadata: { taskAssistant: data },
  } as ToolCallExecutionState;
  const parsedInput = { filter: { completed: false } };
  const pending = Promise.withResolvers<TaskOperationResult>();
  io.request.mockImplementation((channel: string) =>
    channel === "task-assistant:write" ? pending.promise : Promise.resolve(data)
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <AssistantTaskRenderer
            execution={execution}
            parsedInput={parsedInput}
            isDark={false}
            renderDefault={() => null}
          />
        </QueryClientProvider>
      )
    );
    expect(io.request).not.toHaveBeenCalled();
    const check = host.querySelector<HTMLButtonElement>('button[role="checkbox"]');
    if (!check) throw new Error("Missing task action");
    await act(async () => check.click());
    const write = io.request.mock.calls[0];
    expect(write[0]).toBe("task-assistant:write");
    expect(write[1][0]).toBe("set_todo_completed");
    expect(write[1][1]).toMatchObject({
      taskRef: task.taskRef,
      revision: task.revision,
      completed: true,
    });
    expect(write[2]).toBe(database);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector('button[role="checkbox"]')).toBe(check);
      expect(check.disabled).toBe(true);
      expect(host.textContent).toContain(task.title);
      expect(host.textContent).toContain("原始工具警告");
      expect(io.request.mock.calls).toEqual([write]);
      expect(task.completed).toBe(false);
    }
    await act(async () => pending.resolve({ requestId: "original-receipt", status: "pending" }));
    const feedback = toast.items().find(item => item.type === "info");
    if (!feedback?.getMessage) throw new Error("Missing receipt feedback");
    const requests = [...io.request.mock.calls];
    let previous = feedback.getMessage();
    for (const locale of ["zh-CN", "zh-TW"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(toast.items().find(item => item.id === feedback.id)).toBe(feedback);
      expect(feedback.getMessage()).not.toBe(previous);
      previous = feedback.getMessage();
      expect(io.request.mock.calls).toEqual(requests);
      expect(host.querySelector('button[role="checkbox"]')).toBe(check);
    }
    expect(io.request.mock.calls.filter(([channel]) => channel === "task-assistant:write")).toEqual(
      [write]
    );
    expect(execution.input).toBe('{"original":true}');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    queryClient.clear();
    desktopLocaleSource.setLocale(originalLocale);
  }
});
