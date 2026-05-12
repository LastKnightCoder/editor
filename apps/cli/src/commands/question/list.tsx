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
import { parseAnswerIds } from "../../utils/todo-question-helpers.js";

interface QuestionRow {
  id: number;
  question_content: string | null;
  answers: string;
  group_id: number | null;
  status: string;
  create_time: number;
  update_time: number;
  group_title: string | null;
}

interface ListOptions {
  group?: string;
  status?: string;
  limit?: string;
}

const STATUS_ICONS: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  not_started: { icon: "○", color: "gray", label: "未开始" },
  in_progress: { icon: "◐", color: "yellow", label: "进行中" },
  resolved: { icon: "●", color: "green", label: "已解决" },
};

const VALID_STATUSES = ["not_started", "in_progress", "resolved"] as const;

function getAnswerCount(answers: string): number {
  return parseAnswerIds(answers).length;
}

function QuestionListOutput({ items }: { items: QuestionRow[] }) {
  if (items.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No questions found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text dimColor>{"─".repeat(80)}</Text>
      {items.map((item) => {
        const status = STATUS_ICONS[item.status] || STATUS_ICONS.not_started;
        const title = truncateToWidth(item.question_content || "(empty)", 36);
        const group = truncateToWidth(item.group_title || "", 8);
        const count = getAnswerCount(item.answers);
        const time = formatRelativeTime(item.update_time);

        return (
          <Box key={item.id}>
            <Text>{padEnd(`#${item.id}`, 6)}</Text>
            <Text color={status.color}> {status.icon} </Text>
            <Text>{padEnd(title, 37)}</Text>
            <Text dimColor>{padEnd(group, 9)}</Text>
            <Text color={count > 0 ? "cyan" : "gray"}>
              {padEnd(`${count} 答案`, 8)}
            </Text>
            <Text dimColor>{time}</Text>
          </Box>
        );
      })}
      <Text dimColor>{"─".repeat(80)}</Text>
      <Text dimColor>{items.length} questions</Text>
    </Box>
  );
}

export async function runQuestionList(options: ListOptions) {
  const statusResult = validateEnum(options.status, VALID_STATUSES, "--status");
  if (!statusResult.ok) {
    console.log(`Error: ${statusResult.error}`);
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
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (groupResult.value) {
      conditions.push("q.group_id = ?");
      params.push(groupResult.value);
    }

    if (statusResult.value) {
      conditions.push("q.status = ?");
      params.push(statusResult.value);
    }

    const limit = clampLimit(options.limit);
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT q.id, q.question_content, q.answers, q.group_id, q.status,
             q.create_time, q.update_time,
             qg.title AS group_title
      FROM questions q
      LEFT JOIN question_group qg ON q.group_id = qg.id
      ${where}
      ORDER BY q.update_time DESC
      LIMIT ?`;

    const items = da.query<QuestionRow>(sql, ...params, limit);
    const { waitUntilExit } = render(<QuestionListOutput items={items} />);
    await waitUntilExit();
  } finally {
    closeDataAccess();
  }
}
