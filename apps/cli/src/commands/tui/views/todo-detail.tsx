import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { emitTodoMutation } from "../../../utils/todo-question-helpers.js";
import {
  formatRelativeTime,
  extractPlainText,
  truncateToWidth,
  padEnd,
} from "../../../utils/text.js";

interface TodoDetailRow {
  id: number;
  title: string;
  type: string;
  is_completed: number;
  due_at: number | null;
  start_at: number | null;
  completed_at: number | null;
  create_time: number;
  update_time: number;
  group_id: number;
  group_title: string | null;
  group_color: string | null;
  description_content: string | null;
}

interface SubtaskRow {
  id: number;
  title: string;
  is_completed: number;
  due_at: number | null;
  type: string;
  sort_index: number;
}

const TYPE_LABELS: Record<string, string> = {
  normal: "普通任务",
  deadline: "截止任务",
  recurring: "周期任务",
};

const TYPE_COLORS: Record<string, string> = {
  normal: "gray",
  deadline: "red",
  recurring: "magenta",
};

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function getDueRelative(dueAt: number | null, isCompleted: boolean): string {
  if (!dueAt || isCompleted) return "";
  const diff = dueAt - Date.now();
  if (diff < 0) return " (已逾期)";
  const days = Math.ceil(diff / 86400000);
  if (days === 0) return " (今天到期)";
  if (days === 1) return " (明天到期)";
  return ` (${days}天后到期)`;
}

export function TodoDetailView({
  todoId,
  onBack,
  onShowSubtask,
}: {
  todoId: number;
  onBack: () => void;
  onShowSubtask?: (id: number) => void;
}) {
  const [item, setItem] = useState<TodoDetailRow | null>(null);
  const [subtasks, setSubtasks] = useState<SubtaskRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadDetail();
  }, [todoId]);

  function loadDetail() {
    try {
      const dbName = getActiveDbName();
      const da = getDataAccess(dbName);

      const row = da.queryOne<TodoDetailRow>(
        `SELECT ti.id, ti.title, ti.type, ti.is_completed, ti.due_at, ti.start_at,
                ti.completed_at, ti.create_time, ti.update_time, ti.group_id,
                ti.description_content_id,
                tg.title AS group_title, tg.color AS group_color,
                c.content AS description_content
         FROM todo_item ti
         LEFT JOIN todo_group tg ON ti.group_id = tg.id
         LEFT JOIN contents c ON ti.description_content_id = c.id
         WHERE ti.id = ?`,
        todoId,
      );

      if (!row) {
        setNotFound(true);
        return;
      }

      setItem(row);

      const subs = da.query<SubtaskRow>(
        `SELECT id, title, is_completed, due_at, type, sort_index
         FROM todo_item
         WHERE parent_id = ? AND is_archived = 0
         ORDER BY sort_index ASC`,
        todoId,
      );
      setSubtasks(subs);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }

  useInput((input, key) => {
    if (key.escape || input === "q") {
      closeDataAccess();
      onBack();
      return;
    }

    if (subtasks.length > 0) {
      if (key.upArrow || input === "k") {
        setCursor((c) => (c > 0 ? c - 1 : subtasks.length - 1));
      } else if (key.downArrow || input === "j") {
        setCursor((c) => (c < subtasks.length - 1 ? c + 1 : 0));
      } else if (key.return) {
        const sub = subtasks[cursor];
        if (sub && onShowSubtask) {
          closeDataAccess();
          onShowSubtask(sub.id);
        }
      }
    }

    if (input === " " || input === "x") {
      toggleComplete();
    }
  });

  function toggleComplete() {
    if (!item) return;
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
      loadDetail();
      setMessage(newCompleted ? "Completed" : "Uncompleted");
      setTimeout(() => setMessage(""), 1500);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }

  if (notFound) {
    return (
      <Box flexDirection="column">
        <Text color="red">Task #{todoId} not found.</Text>
        <Text dimColor>Esc/q back</Text>
      </Box>
    );
  }

  if (!item) {
    return (
      <Box>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  const description = item.description_content
    ? truncateToWidth(extractPlainText(item.description_content), 70)
    : "";

  const dueRelative = getDueRelative(item.due_at, !!item.is_completed);

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Todo #{item.id}:
        </Text>
        <Text bold> {item.title}</Text>
      </Box>
      <Text dimColor>{"─".repeat(64)}</Text>

      <Box flexDirection="column" marginY={0}>
        <Box>
          <Box width={12}>
            <Text dimColor>Group</Text>
          </Box>
          <Text color={item.group_color || "white"}>
            {item.group_title || "—"}
          </Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Type</Text>
          </Box>
          <Text color={TYPE_COLORS[item.type] || "gray"}>
            {TYPE_LABELS[item.type] || item.type}
          </Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Status</Text>
          </Box>
          {item.is_completed ? (
            <Text color="green">● 已完成</Text>
          ) : (
            <Text>○ 待完成</Text>
          )}
        </Box>
        {item.due_at && (
          <Box>
            <Box width={12}>
              <Text dimColor>Due</Text>
            </Box>
            <Text>{formatDate(item.due_at)}</Text>
            <Text color={dueRelative.includes("逾期") ? "red" : "yellow"}>
              {dueRelative}
            </Text>
          </Box>
        )}
        {item.start_at && (
          <Box>
            <Box width={12}>
              <Text dimColor>Start</Text>
            </Box>
            <Text>{formatDate(item.start_at)}</Text>
          </Box>
        )}
        <Box>
          <Box width={12}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatRelativeTime(item.create_time)}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatRelativeTime(item.update_time)}</Text>
        </Box>
      </Box>

      {description && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{"─".repeat(64)}</Text>
          <Box>
            <Box width={12}>
              <Text dimColor>Description</Text>
            </Box>
            <Text>{description}</Text>
          </Box>
        </Box>
      )}

      {subtasks.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{"─".repeat(64)}</Text>
          <Text dimColor>
            Subtasks ({subtasks.filter((s) => s.is_completed).length}/
            {subtasks.length} completed):
          </Text>
          <Box flexDirection="column">
            {subtasks.map((sub, i) => {
              const isLast = i === subtasks.length - 1;
              const isSelected = i === cursor;
              const connector = isLast ? "└── " : "├── ";
              const icon = sub.is_completed ? "●" : "○";
              const iconColor = sub.is_completed ? "green" : "gray";

              return (
                <Box key={sub.id}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "❯ " : "  "}
                    {connector}
                  </Text>
                  <Text color={iconColor}>{icon} </Text>
                  <Text
                    color={
                      isSelected
                        ? "white"
                        : sub.is_completed
                          ? "gray"
                          : undefined
                    }
                    strikethrough={!!sub.is_completed}
                  >
                    {truncateToWidth(sub.title, 44)}
                  </Text>
                  {sub.is_completed && <Text color="green"> ✓</Text>}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Text dimColor>{"─".repeat(64)}</Text>
      {message ? (
        <Text color="green">{message}</Text>
      ) : (
        <Text dimColor>
          Space toggle
          {subtasks.length > 0 ? " · ↑↓/jk subtask · Enter open" : ""} · Esc
          back
        </Text>
      )}
    </Box>
  );
}
