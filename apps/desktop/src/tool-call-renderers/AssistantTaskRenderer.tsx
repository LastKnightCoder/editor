import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, toast } from "@tau/ui";
import {
  taskKey,
  type AssistantTask,
  type AssistantCalendarEvent,
  type AssistantQueryResult,
  type TaskBatchResult,
  type TaskOperationResult,
  type TaskWriteName,
} from "@tau/shared/task-assistant";
import { on } from "@/electron";
import { queryClient } from "@/queryClient";
import { taskAssistantRequest } from "@/commands/task-assistant";
import useSettingStore from "@/stores/useSettingStore";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import { TodoCheck } from "@/features/todos/components/TodoBits";
import type { ToolCallCustomRendererProps } from "./types";
import TodoToolRenderer from "./TodoToolRenderer";
import { ToolCard, ToolCardBody, ToolCardHeader, ToolMutedText } from "@tau/chat-ui";
const displayTime = (value: string) =>
  value.length === 10
    ? value
    : new Date(value).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

on("task-assistant:changed", (_event, value: { databaseName: string }) => {
  void queryClient.invalidateQueries({
    queryKey: ["task-assistant", value.databaseName.replace(/\.db$/, "")],
  });
  if (
    useSettingStore.getState().setting.database.active.replace(/\.db$/, "") ===
    value.databaseName.replace(/\.db$/, "")
  ) {
    void queryClient.invalidateQueries({ queryKey: ["todos"] });
    void queryClient.invalidateQueries({ queryKey: ["home"] });
  }
});

type Display =
  | AssistantQueryResult<AssistantTask | AssistantCalendarEvent | Record<string, unknown>>
  | TaskBatchResult;
function parse(props: ToolCallCustomRendererProps): Display | null {
  try {
    const value =
      props.execution.metadata?.taskAssistant ?? JSON.parse(props.execution.output || "null");
    return value &&
      typeof value === "object" &&
      String(value.type).startsWith("assistant-") &&
      Array.isArray(value.items)
      ? (value as Display)
      : null;
  } catch {
    return null;
  }
}
const statusText = {
  succeeded: "已完成",
  failed: "失败",
  pending: "等待回执",
  notExecuted: "未执行",
};

export default function AssistantTaskRenderer(props: ToolCallCustomRendererProps) {
  const initial = parse(props);
  if (!initial) return <TodoToolRenderer {...props} />;
  return <AssistantResult {...props} initial={initial} />;
}

function AssistantResult({
  initial,
  parsedInput,
  execution,
}: ToolCallCustomRendererProps & { initial: Display }) {
  const active = useSettingStore(state => state.setting.database.active);
  const sameDatabase = active.replace(/\.db$/, "") === initial.databaseName.replace(/\.db$/, "");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<TaskOperationResult | null>(null);
  const read = initial.type !== "assistant-task-operation";
  const query = useQuery({
    queryKey: [
      "task-assistant",
      initial.databaseName.replace(/\.db$/, ""),
      execution.toolCallId,
      parsedInput,
    ],
    queryFn: async () => {
      if (initial.type === "assistant-task-operation") {
        const operations = await taskAssistantRequest<
          AssistantQueryResult<Record<string, unknown>>
        >(
          "task-assistant:read",
          ["query_task_operations", { batchId: initial.batchId, pageSize: 100 }],
          initial.databaseName
        );
        return {
          ...initial,
          items: initial.items.map(item => {
            const current = operations.items.find(
              row => row.operationId === item.operationId || row.requestId === item.requestId
            );
            if (!current) return item;
            return {
              ...item,
              operationId: String(current.operationId),
              status:
                current.status === "undone"
                  ? "succeeded"
                  : (current.status as TaskOperationResult["status"]),
              result: current.status === "undone" ? { undone: true } : current.result,
              error: current.error as TaskOperationResult["error"],
              undoableUntil: current.undoable ? Number(current.undoableUntil) : undefined,
            };
          }),
        } as Display;
      }
      return taskAssistantRequest<Display>(
        "task-assistant:read",
        [execution.toolName, parsedInput ?? {}],
        initial.databaseName
      );
    },
    initialData: initial,
    enabled: sameDatabase,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: state =>
      !read &&
      (state.state.data as TaskBatchResult | undefined)?.items.some(
        item => item.status === "pending"
      )
        ? 2000
        : false,
  });
  const data = query.data;
  async function write(name: TaskWriteName, fields: Record<string, unknown>) {
    if (!sameDatabase || busy) return;
    setBusy(true);
    try {
      const item = { requestId: crypto.randomUUID(), ...fields };
      const result = await taskAssistantRequest<TaskOperationResult>(
        "task-assistant:write",
        [name, item, crypto.randomUUID(), undefined],
        initial.databaseName
      );
      setReceipt(result);
      if (result.status === "failed") toast.error(result.error?.message ?? "操作失败");
      else if (result.status === "pending") toast.info("操作尚未完成，请查询执行回执");
      await queryClient.invalidateQueries({
        queryKey: ["task-assistant", initial.databaseName.replace(/\.db$/, "")],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "未收到执行回执");
    } finally {
      setBusy(false);
    }
  }
  const operation = (item: TaskOperationResult) => (
    <div key={item.requestId} className="space-y-1">
      <div className="text-tau-sm text-ink-2 flex items-center justify-between gap-2">
        <span>
          {item.result && typeof item.result === "object" && "undone" in item.result
            ? "已撤销"
            : statusText[item.status]}
          {item.result && typeof item.result === "object" && "title" in item.result
            ? ` · ${String(item.result.title)}`
            : ""}
        </span>
        {item.operationId && item.undoableUntil && item.undoableUntil > Date.now() ? (
          <Button
            variant="ghost"
            disabled={!sameDatabase || busy}
            onClick={() => void write("undo_task_operation", { operationId: item.operationId })}
          >
            撤销
          </Button>
        ) : null}
      </div>
      {item.error ? <ToolMutedText>{item.error.message}</ToolMutedText> : null}
      {item.result && typeof item.result === "object" && "effects" in item.result ? (
        <ToolMutedText>
          {Object.entries(
            item.result.effects as Record<
              string,
              { created: number; updated: number; deleted: number }
            >
          )
            .filter(([key]) => ["todo_item", "calendar_event", "document_task"].includes(key))
            .map(([key, effect]) => {
              const label =
                key === "todo_item" ? "待办" : key === "calendar_event" ? "日程" : "正文待办";
              return [
                effect.created ? `新增 ${effect.created} 项${label}` : null,
                effect.updated ? `修改 ${effect.updated} 项${label}` : null,
                effect.deleted ? `删除 ${effect.deleted} 项${label}` : null,
              ]
                .filter(Boolean)
                .join("，");
            })
            .join("；")}
        </ToolMutedText>
      ) : null}
    </div>
  );
  return (
    <ToolCard>
      <ToolCardHeader>
        <div className="text-tau-body text-ink-1 font-medium">
          {data.type === "assistant-tasks"
            ? "待办"
            : data.type === "assistant-calendar"
              ? "日程"
              : "操作结果"}
        </div>
      </ToolCardHeader>
      <ToolCardBody>
        {!sameDatabase ? (
          <ToolMutedText>这是其他数据库的结果，请切回原数据库后操作。</ToolMutedText>
        ) : null}
        {query.isError ? <ToolMutedText>刷新失败：{String(query.error)}</ToolMutedText> : null}
        {data.type === "assistant-task-operation" ? (
          data.items.map(operation)
        ) : (
          <>
            {data.warnings.map(message => (
              <ToolMutedText key={message}>{message}</ToolMutedText>
            ))}
            {data.items.length === 0 ? (
              <ToolMutedText>
                {data.incomplete ? "当前来源尚未完整加载。" : "没有符合条件的结果。"}
              </ToolMutedText>
            ) : null}
            {data.type === "assistant-tasks"
              ? (data.items as AssistantTask[]).map(task => (
                  <div
                    key={`${taskKey(task.taskRef)}:${task.occurrence?.occurrenceDate ?? ""}`}
                    className="flex items-start gap-2.5"
                  >
                    <TodoCheck
                      recurring={!!task.recurrence?.length}
                      checked={task.completed}
                      disabled={
                        busy ||
                        !sameDatabase ||
                        !task.writable ||
                        (!!task.recurrence?.length && !task.occurrence)
                      }
                      label={task.completed ? "恢复待办" : "完成待办"}
                      onToggle={() =>
                        void write("set_todo_completed", {
                          taskRef: task.taskRef,
                          revision: task.revision,
                          completed: !task.completed,
                          ...(task.occurrence ? { occurrence: task.occurrence } : {}),
                        })
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        disabled={!sameDatabase}
                        className="text-tau-body text-ink-1 text-left"
                        onClick={() => {
                          if (task.taskRef.kind === "todo")
                            openPage("todos", { selectedId: task.taskRef.todoId });
                          else if (task.sourceRef)
                            void openEntity(task.sourceRef, {
                              at: { taskId: task.taskRef.taskId },
                            }).catch(error => toast.error(String(error)));
                        }}
                      >
                        {task.title}
                      </button>
                      <ToolMutedText>
                        {[
                          task.taskRef.kind === "document"
                            ? (task.sourceTitle ?? "正文待办")
                            : "独立待办",
                          task.dueAt ? displayTime(task.dueAt) : null,
                          task.reminderAt ? `提醒 ${displayTime(task.reminderAt)}` : null,
                          task.occurrence
                            ? "周期实例"
                            : task.recurrence?.length
                              ? "周期任务（先查询具体日期再完成）"
                              : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ToolMutedText>
                      {task.readonlyReason ? (
                        <ToolMutedText>{task.readonlyReason}</ToolMutedText>
                      ) : null}
                    </div>
                  </div>
                ))
              : data.type === "assistant-calendar"
                ? (data.items as AssistantCalendarEvent[]).map(event => (
                    <div
                      key={`${event.eventId}:${event.taskRef ? taskKey(event.taskRef) : ""}:${event.occurrence?.occurrenceDate ?? ""}`}
                    >
                      <div className="text-tau-body text-ink-1">{event.title}</div>
                      <ToolMutedText>
                        {displayTime(event.start)} — {displayTime(event.end)}
                        {event.taskRef ? " · 待办安排" : ""}
                      </ToolMutedText>
                    </div>
                  ))
                : (data.items as Record<string, unknown>[]).map(item => (
                    <div
                      key={String(item.operationId)}
                      className="flex items-center justify-between gap-2"
                    >
                      <ToolMutedText>
                        {String(item.tool)} · {String(item.status)}
                      </ToolMutedText>
                      {item.undoable ? (
                        <Button
                          variant="ghost"
                          disabled={busy || !sameDatabase}
                          onClick={() =>
                            void write("undo_task_operation", { operationId: item.operationId })
                          }
                        >
                          撤销
                        </Button>
                      ) : null}
                    </div>
                  ))}
            {data.hasMore ? <ToolMutedText>还有更多结果，可继续查询下一页。</ToolMutedText> : null}
          </>
        )}
        {receipt ? operation(receipt) : null}
      </ToolCardBody>
    </ToolCard>
  );
}
