import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import {
  deleteTodoCascade,
  emitTodoMutation,
} from "../../../utils/todo-question-helpers.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../../utils/text.js";

interface TodoItemRow {
  id: number;
  title: string;
  type: string;
  is_completed: number;
  due_at: number | null;
  start_at: number | null;
  completed_at: number | null;
  update_time: number;
  group_id: number;
  group_title: string | null;
  group_color: string | null;
}

interface GroupRef {
  id: number;
  title: string;
  color: string | null;
}

type StatusFilter = "pending" | "completed" | "overdue" | "all";
type TypeFilter = "all" | "normal" | "deadline" | "recurring";
type InputMode = null | "create" | "confirm-delete";

const STATUS_LABELS: Record<StatusFilter, string> = {
  pending: "待完成",
  completed: "已完成",
  overdue: "已逾期",
  all: "全部",
};

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: "全部",
  normal: "普通",
  deadline: "截止",
  recurring: "周期",
};

const TYPE_COLORS: Record<string, string> = {
  normal: "gray",
  deadline: "red",
  recurring: "magenta",
};

const STATUS_CYCLE: StatusFilter[] = ["pending", "completed", "overdue", "all"];
const TYPE_CYCLE: TypeFilter[] = [
  "all",
  "normal",
  "deadline",
  "recurring",
];
const PAGE_SIZE = 15;

function getStatusIcon(item: TodoItemRow): { icon: string; color: string } {
  if (item.is_completed) return { icon: "●", color: "green" };
  if (item.due_at && item.due_at < Date.now())
    return { icon: "○", color: "red" };
  return { icon: "○", color: "gray" };
}

function getDueText(item: TodoItemRow): { text: string; color: string } {
  if (item.is_completed) return { text: "✓", color: "green" };
  if (!item.due_at) return { text: "", color: "gray" };
  const diff = item.due_at - Date.now();
  if (diff < 0) return { text: "已逾期!", color: "red" };
  const days = Math.ceil(diff / 86400000);
  if (days === 0) return { text: "今天到期", color: "yellow" };
  if (days === 1) return { text: "明天到期", color: "yellow" };
  return { text: `${days}天后`, color: "gray" };
}

function queryTodos(
  statusFilter: StatusFilter,
  typeFilter: TypeFilter,
  groupFilter: number | null,
  systemTypeFilter: string | null,
): TodoItemRow[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  const conditions: string[] = ["ti.is_archived = 0", "ti.parent_id IS NULL"];
  const params: unknown[] = [];

  if (systemTypeFilter && systemTypeFilter !== "all") {
    conditions.push("ti.type = ?");
    params.push(systemTypeFilter);
  } else if (groupFilter !== null) {
    conditions.push("ti.group_id = ?");
    params.push(groupFilter);
  }

  if (statusFilter === "pending") {
    conditions.push("ti.is_completed = 0");
  } else if (statusFilter === "completed") {
    conditions.push("ti.is_completed = 1");
  } else if (statusFilter === "overdue") {
    conditions.push(
      "ti.is_completed = 0 AND ti.due_at IS NOT NULL AND ti.due_at < ?",
    );
    params.push(Date.now());
  }

  if (typeFilter !== "all" && !systemTypeFilter) {
    conditions.push("ti.type = ?");
    params.push(typeFilter);
  }

  return da.query<TodoItemRow>(
    `SELECT ti.id, ti.title, ti.type, ti.is_completed, ti.due_at, ti.start_at,
            ti.completed_at, ti.update_time, ti.group_id,
            tg.title AS group_title, tg.color AS group_color
     FROM todo_item ti
     LEFT JOIN todo_group tg ON ti.group_id = tg.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ti.is_completed ASC, ti.sort_index ASC, ti.update_time DESC
     LIMIT 200`,
    ...params,
  );
}

function loadGroups(): GroupRef[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);
  return da.query<GroupRef>(
    `SELECT id, title, color FROM todo_group WHERE is_archived = 0 AND is_system = 0 ORDER BY sort_index ASC`,
  );
}

export function TodoListView({
  onBack,
  onShowTodo,
  initialGroupId,
  initialSystemType,
}: {
  onBack: () => void;
  onShowTodo: (todoId: number) => void;
  initialGroupId?: number;
  initialSystemType?: string;
}) {
  const [items, setItems] = useState<TodoItemRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [groupFilter, setGroupFilter] = useState<number | null>(
    initialGroupId ?? null,
  );
  const [systemTypeFilter] = useState<string | null>(initialSystemType ?? null);
  const [groups, setGroups] = useState<GroupRef[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>(null);
  const [inputBuffer, setInputBuffer] = useState("");
  const [message, setMessage] = useState("");

  const loadItems = useCallback(() => {
    try {
      const result = queryTodos(
        statusFilter,
        typeFilter,
        groupFilter,
        systemTypeFilter,
      );
      setItems(result);
      setCursor(0);
      setPage(0);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }, [statusFilter, typeFilter, groupFilter, systemTypeFilter]);

  useEffect(() => {
    setGroups(loadGroups());
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const currentGroupLabel =
    groupFilter === null
      ? "全部"
      : groups.find((g) => g.id === groupFilter)?.title || `#${groupFilter}`;

  const pendingCount = items.filter((i) => !i.is_completed).length;

  useInput((input, key) => {
    if (inputMode === "create") {
      if (key.escape) {
        setInputMode(null);
        setInputBuffer("");
        return;
      }
      if (key.return) {
        if (inputBuffer.trim()) {
          createTodo(inputBuffer.trim());
        }
        setInputMode(null);
        setInputBuffer("");
        return;
      }
      if (key.backspace || key.delete) {
        setInputBuffer((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setInputBuffer((s) => s + input);
      }
      return;
    }

    if (inputMode === "confirm-delete") {
      if (input === "y") {
        deleteTodo();
        setInputMode(null);
      } else {
        setInputMode(null);
        setMessage("");
      }
      return;
    }

    if (key.escape || input === "q") {
      closeDataAccess();
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : pageItems.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < pageItems.length - 1 ? c + 1 : 0));
    } else if (input === "n" || key.pageDown) {
      if (page < totalPages - 1) {
        setPage((p) => p + 1);
        setCursor(0);
      }
    } else if (input === "p" || key.pageUp) {
      if (page > 0) {
        setPage((p) => p - 1);
        setCursor(0);
      }
    } else if (input === " " || input === "x") {
      const item = pageItems[cursor];
      if (item) toggleComplete(item);
    } else if (key.return) {
      const item = pageItems[cursor];
      if (item) {
        closeDataAccess();
        onShowTodo(item.id);
      }
    } else if (input === "c") {
      if (systemTypeFilter && systemTypeFilter !== "all") {
        setMessage("Cannot create tasks in system type view");
        setTimeout(() => setMessage(""), 2000);
      } else {
        setInputMode("create");
        setInputBuffer("");
      }
    } else if (input === "d") {
      const item = pageItems[cursor];
      if (item) {
        setInputMode("confirm-delete");
        setMessage(`Delete "${truncateToWidth(item.title, 20)}"? (y/n)`);
      }
    } else if (input === "g") {
      if (systemTypeFilter) return;
      const allGroupIds = [null, ...groups.map((g) => g.id)];
      const currentIdx = allGroupIds.indexOf(groupFilter);
      const nextIdx = (currentIdx + 1) % allGroupIds.length;
      setGroupFilter(allGroupIds[nextIdx]);
    } else if (input === "s") {
      const currentIdx = STATUS_CYCLE.indexOf(statusFilter);
      setStatusFilter(STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length]);
    } else if (input === "t") {
      if (systemTypeFilter) return;
      const currentIdx = TYPE_CYCLE.indexOf(typeFilter);
      setTypeFilter(TYPE_CYCLE[(currentIdx + 1) % TYPE_CYCLE.length]);
    } else if (input === "r") {
      loadItems();
      setMessage("Refreshed");
      setTimeout(() => setMessage(""), 1500);
    }
  });

  function toggleComplete(item: TodoItemRow) {
    try {
      const dbName = getActiveDbName();
      const da = getDataAccess(dbName);
      const now = Date.now();
      const newCompleted = item.is_completed ? 0 : 1;

      da.exec(
        `WITH RECURSIVE descendants(id) AS (
          SELECT id FROM todo_item WHERE id = ?
          UNION ALL
          SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
        )
        UPDATE todo_item SET is_completed = ?, completed_at = ?, update_time = ?
        WHERE id IN (SELECT id FROM descendants)`,
        item.id,
        newCompleted,
        newCompleted ? now : null,
        now,
      );
      emitTodoMutation({
        entityId: item.id,
        groupId: item.group_id,
        action: newCompleted ? "complete-item" : "uncomplete-item",
      });
      loadItems();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }

  function createTodo(title: string) {
    try {
      const dbName = getActiveDbName();
      const da = getDataAccess(dbName);
      const now = Date.now();
      const targetGroup = groupFilter ?? groups[0]?.id;
      if (!targetGroup) {
        setMessage("No group available");
        return;
      }
      const maxSort = da.queryOne<{ m: number | null }>(
        `SELECT MAX(sort_index) AS m FROM todo_item WHERE group_id = ? AND parent_id IS NULL`,
        targetGroup,
      );
      da.exec(
        `INSERT INTO todo_item (group_id, parent_id, title, type, is_completed, sort_index, is_archived, create_time, update_time)
         VALUES (?, NULL, ?, 'normal', 0, ?, 0, ?, ?)`,
        targetGroup,
        title,
        (maxSort?.m ?? 0) + 1,
        now,
        now,
      );
      emitTodoMutation({ groupId: targetGroup, action: "create-item" });
      setMessage(`Created: ${title}`);
      setTimeout(() => setMessage(""), 2000);
      loadItems();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }

  function deleteTodo() {
    const item = pageItems[cursor];
    if (!item) return;
    try {
      deleteTodoCascade(item.id);
      setMessage(`Deleted #${item.id}`);
      setTimeout(() => setMessage(""), 2000);
      loadItems();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Todo List
        </Text>
        <Text dimColor>
          {" "}
          ({statusFilter === "all" ? items.length : pendingCount}{" "}
          {statusFilter === "pending" ? "pending" : "tasks"})
        </Text>
        <Text dimColor> [</Text>
        <Text color="yellow">{STATUS_LABELS[statusFilter]}</Text>
        <Text dimColor>] [</Text>
        <Text color="cyan">{currentGroupLabel}</Text>
        <Text dimColor>] [</Text>
        <Text color={TYPE_COLORS[systemTypeFilter || typeFilter] || "gray"}>
          {systemTypeFilter
            ? TYPE_LABELS[systemTypeFilter as TypeFilter] || systemTypeFilter
            : TYPE_LABELS[typeFilter]}
        </Text>
        <Text dimColor>]</Text>
        <Text dimColor>
          {" "}
          Page {page + 1}/{totalPages}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(80)}</Text>

      {pageItems.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No tasks found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {pageItems.map((item, i) => {
            const isSelected = i === cursor;
            const status = getStatusIcon(item);
            const title = truncateToWidth(item.title, 32);
            const group = truncateToWidth(item.group_title || "", 8);
            const typeBadge = TYPE_LABELS[item.type as TypeFilter] || "普通";
            const due = getDueText(item);

            return (
              <Box key={item.id}>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {isSelected ? "❯" : " "} {padEnd(`#${item.id}`, 6)}
                </Text>
                <Text color={status.color}>{status.icon} </Text>
                <Text
                  color={
                    isSelected
                      ? "white"
                      : item.is_completed
                        ? "gray"
                        : undefined
                  }
                  strikethrough={!!item.is_completed}
                >
                  {padEnd(title, 33)}
                </Text>
                <Text color={item.group_color || "gray"} dimColor={!isSelected}>
                  {padEnd(group, 9)}
                </Text>
                <Text color={TYPE_COLORS[item.type] || "gray"}>
                  {padEnd(typeBadge, 5)}
                </Text>
                <Text color={due.color}> {due.text}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Text dimColor>{"─".repeat(80)}</Text>

      {inputMode === "create" ? (
        <Box>
          <Text color="cyan">New task: </Text>
          <Text>{inputBuffer}</Text>
          <Text dimColor>█</Text>
          <Text dimColor> (Enter create, Esc cancel)</Text>
        </Box>
      ) : message ? (
        <Text color="green">{message}</Text>
      ) : (
        <Text dimColor>
          {systemTypeFilter
            ? "↑↓/jk nav · Space toggle · d delete · s status · Enter detail · Esc back"
            : "↑↓/jk nav · Space toggle · c create · d delete · g group · s status · t type · Enter detail · Esc back"}
        </Text>
      )}
    </Box>
  );
}
