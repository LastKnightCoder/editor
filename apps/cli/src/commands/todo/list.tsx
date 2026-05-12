import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../utils/text.js";
import {
  clampLimit,
  validateEnum,
  parsePositiveIntOrError,
} from "../../utils/validate.js";

interface TodoRow {
  id: number;
  title: string;
  type: string;
  is_completed: number;
  due_at: number | null;
  completed_at: number | null;
  update_time: number;
  group_title: string | null;
}

interface ListOptions {
  group?: string;
  status?: string;
  type?: string;
  limit?: string;
}

const TYPE_LABELS: Record<string, { text: string; color: string }> = {
  normal: { text: "普通", color: "gray" },
  deadline: { text: "截止", color: "red" },
  planned: { text: "计划", color: "blue" },
  recurring: { text: "周期", color: "magenta" },
};

function getStatusIcon(item: TodoRow): { icon: string; color: string } {
  if (item.is_completed) return { icon: "●", color: "green" };
  if (item.due_at && item.due_at < Date.now())
    return { icon: "○", color: "red" };
  return { icon: "○", color: "gray" };
}

function getDueText(item: TodoRow): string {
  if (item.is_completed) return "✓";
  if (!item.due_at) return "";
  const diff = item.due_at - Date.now();
  if (diff < 0) return "已逾期";
  const days = Math.ceil(diff / 86400000);
  if (days === 0) return "今天到期";
  if (days === 1) return "明天到期";
  return `${days}天后到期`;
}

const VALID_STATUSES = ["pending", "completed", "overdue"] as const;
const VALID_TYPES = ["normal", "deadline", "planned", "recurring"] as const;

function TodoListOutput({ items }: { items: TodoRow[] }) {
  if (items.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No tasks found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text dimColor>{"─".repeat(80)}</Text>
      {items.map((item) => {
        const status = getStatusIcon(item);
        const typeBadge = TYPE_LABELS[item.type] || TYPE_LABELS.normal;
        const title = truncateToWidth(item.title, 34);
        const group = truncateToWidth(item.group_title || "", 8);
        const due = getDueText(item);
        const time = formatRelativeTime(item.update_time);

        return (
          <Box key={item.id}>
            <Text>{padEnd(`#${item.id}`, 6)}</Text>
            <Text color={status.color}> {status.icon} </Text>
            <Text>{padEnd(title, 35)}</Text>
            <Text dimColor>{padEnd(group, 9)}</Text>
            <Text color={typeBadge.color}>{padEnd(typeBadge.text, 5)}</Text>
            <Text color={due === "已逾期" ? "red" : "gray"}>
              {padEnd(due, 10)}
            </Text>
            <Text dimColor>{time}</Text>
          </Box>
        );
      })}
      <Text dimColor>{"─".repeat(80)}</Text>
      <Text dimColor>{items.length} tasks</Text>
    </Box>
  );
}

export async function runTodoList(options: ListOptions) {
  const statusResult = validateEnum(options.status, VALID_STATUSES, "--status");
  if (!statusResult.ok) {
    console.log(`Error: ${statusResult.error}`);
    return;
  }

  const typeResult = validateEnum(options.type, VALID_TYPES, "--type");
  if (!typeResult.ok) {
    console.log(`Error: ${typeResult.error}`);
    return;
  }

  const groupResult = parsePositiveIntOrError(options.group, "--group");
  if (!groupResult.ok) {
    console.log(`Error: ${groupResult.error}`);
    return;
  }

  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  try {
    const conditions: string[] = ["ti.is_archived = 0", "ti.parent_id IS NULL"];
    const params: unknown[] = [];

    if (groupResult.value) {
      conditions.push("ti.group_id = ?");
      params.push(groupResult.value);
    }

    if (statusResult.value === "pending") {
      conditions.push("ti.is_completed = 0");
    } else if (statusResult.value === "completed") {
      conditions.push("ti.is_completed = 1");
    } else if (statusResult.value === "overdue") {
      conditions.push(
        "ti.is_completed = 0 AND ti.due_at IS NOT NULL AND ti.due_at < ?",
      );
      params.push(Date.now());
    }

    if (typeResult.value) {
      conditions.push("ti.type = ?");
      params.push(typeResult.value);
    }

    const limit = clampLimit(options.limit);

    const sql = `
      SELECT ti.id, ti.title, ti.type, ti.is_completed, ti.due_at,
             ti.completed_at, ti.update_time, tg.title AS group_title
      FROM todo_item ti
      LEFT JOIN todo_group tg ON ti.group_id = tg.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY ti.is_completed ASC, ti.sort_index ASC, ti.update_time DESC
      LIMIT ?`;

    const items = da.query<TodoRow>(sql, ...params, limit);
    const { waitUntilExit } = render(<TodoListOutput items={items} />);
    await waitUntilExit();
  } finally {
    closeDataAccess();
  }
}
