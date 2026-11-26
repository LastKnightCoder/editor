import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
  ToolValuePill,
} from "@tau/chat-ui";

import { useTodoToolI18n, type TodoToolTranslate, type TodoToolMessageKey } from "./todo.i18n";

type OperationPayload = {
  success?: boolean;
  todoId?: number;
  todoItemId?: number;
  recurrence?: {
    id: number;
    type: string;
    interval: number;
  } | null;
  notes?: Array<{
    id: number;
    title?: string;
    type?: string;
    contentId: number;
  }>;
  mappings?: Array<{
    id: number;
    calendarEventId: number;
    syncType: string;
    recurrenceDate?: number | null;
  }>;
  event?: {
    action?: string;
    entityType?: string;
    entityId?: number;
    groupId?: number | null;
    relatedItemId?: number | null;
  };
  data?: Record<string, unknown> | null;
};

const entityTypeMessages: Record<string, TodoToolMessageKey> = {
  item: "todo.entity.item",
  group: "todo.entity.group",
  recurrence: "todo.entity.recurrence",
  "note-link": "todo.entity.note-link",
  "calendar-mapping": "todo.entity.calendar-mapping",
};

const getDisplayTitle = (payload: OperationPayload) => {
  const data = payload.data;
  if (!data || typeof data !== "object") return null;
  const title = typeof data.title === "string" ? data.title : null;
  return title && title.trim() ? title.trim() : null;
};

const getDisplayGroupTitle = (payload: OperationPayload) => {
  const data = payload.data;
  if (!data || typeof data !== "object") return null;
  const groupTitle = typeof data.groupTitle === "string" ? data.groupTitle : null;
  return groupTitle && groupTitle.trim() ? groupTitle.trim() : null;
};

const parsePayload = (output?: string): OperationPayload | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as OperationPayload;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const actionMessages: Record<string, TodoToolMessageKey> = {
  "create-group": "todo.action.create-group",
  "update-group": "todo.action.update-group",
  "archive-group": "todo.action.archive-group",
  "unarchive-group": "todo.action.unarchive-group",
  "reorder-groups": "todo.action.reorder-groups",
  "create-item": "todo.action.create-item",
  "create-item-above": "todo.action.create-item-above",
  "create-item-below": "todo.action.create-item-below",
  "create-item-child": "todo.action.create-item-child",
  "update-item": "todo.action.update-item",
  "complete-item": "todo.action.complete-item",
  "uncomplete-item": "todo.action.uncomplete-item",
  "move-item": "todo.action.move-item",
  "archive-item": "todo.action.archive-item",
  "unarchive-item": "todo.action.unarchive-item",
  "delete-item": "todo.action.delete-item",
  "delete-item-cascade": "todo.action.delete-item-cascade",
  "create-recurrence": "todo.action.create-recurrence",
  "update-recurrence": "todo.action.update-recurrence",
  "delete-recurrence": "todo.action.delete-recurrence",
  "complete-occurrence": "todo.action.complete-occurrence",
  "uncomplete-occurrence": "todo.action.uncomplete-occurrence",
  "skip-occurrence": "todo.action.skip-occurrence",
  "attach-note": "todo.action.attach-note",
  "create-and-attach-note": "todo.action.create-and-attach-note",
  "detach-note": "todo.action.detach-note",
  "reorder-notes": "todo.action.reorder-notes",
  "update-note-title-snapshot": "todo.action.update-note-title-snapshot",
  "create-calendar-mapping": "todo.action.create-calendar-mapping",
  "delete-calendar-mapping": "todo.action.delete-calendar-mapping",
  "delete-calendar-mappings-by-todo": "todo.action.delete-calendar-mappings-by-todo",
  "sync-item-to-calendar": "todo.action.sync-item-to-calendar",
  "remove-item-from-calendar": "todo.action.remove-item-from-calendar",
};

const getPrimaryText = (payload: OperationPayload, t: TodoToolTranslate) => {
  const action = payload.event?.action;
  if (action && actionMessages[action]) {
    return t(actionMessages[action]);
  }

  if (Array.isArray(payload.notes)) {
    return t("todo.notes", { count: payload.notes.length });
  }

  if (Array.isArray(payload.mappings)) {
    return t("todo.mappings", { count: payload.mappings.length });
  }

  if (payload.recurrence) {
    return t("todo.recurrenceRead");
  }

  return payload.success === false ? t("todo.failed") : t("todo.done");
};

const renderDataSummary = (payload: OperationPayload, isDark: boolean, t: TodoToolTranslate) => {
  if (Array.isArray(payload.notes)) {
    return (
      <div className="space-y-1.5">
        {payload.notes.slice(0, 6).map(note => (
          <ToolValuePill key={note.id} isDark={isDark}>
            {note.title || t("todo.content", { id: note.contentId })}
            {note.type ? ` · ${note.type}` : ""}
          </ToolValuePill>
        ))}
      </div>
    );
  }

  if (Array.isArray(payload.mappings)) {
    return (
      <div className="space-y-1.5">
        {payload.mappings.slice(0, 6).map(mapping => (
          <ToolValuePill key={mapping.id} isDark={isDark}>
            <span className="tabular-nums">{t("todo.event", { id: mapping.calendarEventId })}</span>{" "}
            · {mapping.syncType}
          </ToolValuePill>
        ))}
      </div>
    );
  }

  if (payload.recurrence) {
    return (
      <ToolValuePill isDark={isDark}>
        {t("todo.recurrence", {
          type: payload.recurrence.type,
          interval: payload.recurrence.interval,
        })}
      </ToolValuePill>
    );
  }

  const data = payload.data;
  if (data && typeof data === "object") {
    const title = typeof data.title === "string" ? data.title : null;
    if (title) {
      return <ToolValuePill isDark={isDark}>{t("todo.title", { title })}</ToolValuePill>;
    }
  }

  return null;
};

const TodoOperationRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const { t } = useTodoToolI18n();
  const payload = parsePayload(execution.output);
  if (!payload) {
    return <>{renderDefault()}</>;
  }

  const primaryText = getPrimaryText(payload, t);
  const dataSummary = renderDataSummary(payload, isDark, t);
  const displayTitle = getDisplayTitle(payload);
  const displayGroupTitle = getDisplayGroupTitle(payload);
  const entityLabel = payload.event?.entityType
    ? entityTypeMessages[payload.event.entityType]
      ? t(entityTypeMessages[payload.event.entityType])
      : null
    : null;
  const hasSecondaryContent = Boolean(displayTitle || displayGroupTitle || dataSummary);
  const failed = payload.success === false;

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
        <div
          className={
            hasSecondaryContent ? "flex items-center gap-2" : "flex items-center gap-2 pb-2"
          }
        >
          <div className={`text-tau-body font-medium ${failed ? "text-danger" : "text-ink-1"}`}>
            {primaryText}
          </div>
          {entityLabel ? <ToolBadge isDark={isDark}>{entityLabel}</ToolBadge> : null}
        </div>
      </ToolCardHeader>
      {hasSecondaryContent ? (
        <ToolCardBody>
          {displayTitle || displayGroupTitle ? (
            <div className="space-y-0.5">
              {displayTitle ? (
                <ToolMutedText isDark={isDark}>
                  {t("todo.related", { title: displayTitle })}
                </ToolMutedText>
              ) : null}
              {displayGroupTitle ? (
                <ToolMutedText isDark={isDark}>
                  {t("todo.group", { title: displayGroupTitle })}
                </ToolMutedText>
              ) : null}
            </div>
          ) : null}
          {dataSummary}
        </ToolCardBody>
      ) : null}
    </ToolCard>
  );
};

export default TodoOperationRenderer;
