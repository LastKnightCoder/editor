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
import { useAssistantToolI18n, assistantFeedback, assistantFailure } from "./assistant.i18n";
import { toolDateLabel } from "./date-format";

const displayTime = (value: string, locale: string) =>
  value.length === 10
    ? toolDateLabel(value, locale)
    : new Date(value).toLocaleString(locale, {
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
  const { t, locale } = useAssistantToolI18n();
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
      if (result.status === "failed")
        toast.error(assistantFailure("assistant.failed", result.error?.message));
      else if (result.status === "pending")
        toast.info(assistantFeedback("assistant.pendingFeedback"));
      await queryClient.invalidateQueries({
        queryKey: ["task-assistant", initial.databaseName.replace(/\.db$/, "")],
      });
    } catch (error) {
      toast.error(
        assistantFailure(
          "assistant.receiptFailed",
          error instanceof Error ? error.message : undefined
        )
      );
    } finally {
      setBusy(false);
    }
  }
  const operation = (item: TaskOperationResult) => (
    <div key={item.requestId} className="space-y-1">
      <div className="text-tau-sm text-ink-2 flex items-center justify-between gap-2">
        <span>
          {item.result && typeof item.result === "object" && "undone" in item.result
            ? t("assistant.undone")
            : t(`assistant.status.${item.status}`)}
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
            {t("assistant.undo")}
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
              const entity =
                key === "todo_item"
                  ? "assistant.entity.todo_item"
                  : key === "calendar_event"
                    ? "assistant.entity.calendar_event"
                    : "assistant.entity.document_task";
              return [
                effect.created
                  ? t("assistant.effect.created", {
                      count: effect.created,
                      entity: t(entity, { count: effect.created }),
                    })
                  : null,
                effect.updated
                  ? t("assistant.effect.updated", {
                      count: effect.updated,
                      entity: t(entity, { count: effect.updated }),
                    })
                  : null,
                effect.deleted
                  ? t("assistant.effect.deleted", {
                      count: effect.deleted,
                      entity: t(entity, { count: effect.deleted }),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(t("assistant.effect.join"));
            })
            .join(t("assistant.effect.groupJoin"))}
        </ToolMutedText>
      ) : null}
    </div>
  );
  return (
    <ToolCard>
      <ToolCardHeader>
        <div className="text-tau-body text-ink-1 font-medium">
          {data.type === "assistant-tasks"
            ? t("assistant.tasks")
            : data.type === "assistant-calendar"
              ? t("assistant.calendar")
              : t("assistant.operations")}
        </div>
      </ToolCardHeader>
      <ToolCardBody>
        {!sameDatabase ? <ToolMutedText>{t("assistant.differentDatabase")}</ToolMutedText> : null}
        {query.isError ? (
          <ToolMutedText>
            {t("assistant.refreshFailed", { reason: String(query.error) })}
          </ToolMutedText>
        ) : null}
        {data.type === "assistant-task-operation" ? (
          data.items.map(operation)
        ) : (
          <>
            {data.warnings.map(message => (
              <ToolMutedText key={message}>{message}</ToolMutedText>
            ))}
            {data.items.length === 0 ? (
              <ToolMutedText>
                {data.incomplete ? t("assistant.incomplete") : t("assistant.empty")}
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
                      label={
                        task.completed ? t("assistant.restoreTask") : t("assistant.completeTask")
                      }
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
                            ? (task.sourceTitle ?? t("assistant.documentTask"))
                            : t("assistant.standaloneTask"),
                          task.dueAt ? displayTime(task.dueAt, locale) : null,
                          task.reminderAt
                            ? t("assistant.reminder", {
                                time: displayTime(task.reminderAt, locale),
                              })
                            : null,
                          task.occurrence
                            ? t("assistant.occurrence")
                            : task.recurrence?.length
                              ? t("assistant.recurring")
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
                        {displayTime(event.start, locale)} — {displayTime(event.end, locale)}
                        {event.taskRef ? t("assistant.scheduledTask") : ""}
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
                          {t("assistant.undo")}
                        </Button>
                      ) : null}
                    </div>
                  ))}
            {data.hasMore ? <ToolMutedText>{t("assistant.more")}</ToolMutedText> : null}
          </>
        )}
        {receipt ? operation(receipt) : null}
      </ToolCardBody>
    </ToolCard>
  );
}
