import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { parseAnswerIds } from "../../../utils/todo-question-helpers.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../../utils/text.js";

interface QuestionRow {
  id: number;
  question_content: string | null;
  answers: string;
  group_id: number | null;
  status: string;
  update_time: number;
  group_title: string | null;
  group_color: string | null;
}

interface GroupRef {
  id: number;
  title: string;
  color: string | null;
}

type StatusFilter = "all" | "not_started" | "in_progress" | "resolved";

const STATUS_CYCLE: StatusFilter[] = [
  "all",
  "not_started",
  "in_progress",
  "resolved",
];

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "全部",
  not_started: "未开始",
  in_progress: "进行中",
  resolved: "已解决",
};

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  not_started: { icon: "○", color: "gray" },
  in_progress: { icon: "◐", color: "yellow" },
  resolved: { icon: "●", color: "green" },
};

const PAGE_SIZE = 15;

function queryQuestions(
  statusFilter: StatusFilter,
  groupFilter: number | null,
): QuestionRow[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (groupFilter !== null) {
    conditions.push("q.group_id = ?");
    params.push(groupFilter);
  }

  if (statusFilter !== "all") {
    conditions.push("q.status = ?");
    params.push(statusFilter);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return da.query<QuestionRow>(
    `SELECT q.id, q.question_content, q.answers, q.group_id, q.status,
            q.update_time,
            qg.title AS group_title, qg.color AS group_color
     FROM questions q
     LEFT JOIN question_group qg ON q.group_id = qg.id
     ${where}
     ORDER BY q.update_time DESC
     LIMIT 200`,
    ...params,
  );
}

function loadGroups(): GroupRef[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);
  return da.query<GroupRef>(
    `SELECT id, title, color FROM question_group ORDER BY sort_index ASC`,
  );
}

export function QuestionListView({
  onBack,
  onShowQuestion,
  initialGroupId,
}: {
  onBack: () => void;
  onShowQuestion: (questionId: number) => void;
  initialGroupId?: number;
}) {
  const [items, setItems] = useState<QuestionRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState<number | null>(
    initialGroupId ?? null,
  );
  const [groups, setGroups] = useState<GroupRef[]>([]);
  const [message, setMessage] = useState("");

  const loadItems = useCallback(() => {
    try {
      const result = queryQuestions(statusFilter, groupFilter);
      setItems(result);
      setCursor(0);
      setPage(0);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }, [statusFilter, groupFilter]);

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

  useInput((input, key) => {
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
    } else if (key.return) {
      const item = pageItems[cursor];
      if (item) {
        closeDataAccess();
        onShowQuestion(item.id);
      }
    } else if (input === "s") {
      const currentIdx = STATUS_CYCLE.indexOf(statusFilter);
      setStatusFilter(STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length]);
    } else if (input === "g") {
      const allGroupIds = [null, ...groups.map((g) => g.id)];
      const currentIdx = allGroupIds.indexOf(groupFilter);
      const nextIdx = (currentIdx + 1) % allGroupIds.length;
      setGroupFilter(allGroupIds[nextIdx]);
    } else if (input === "r") {
      loadItems();
      setMessage("Refreshed");
      setTimeout(() => setMessage(""), 1500);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Questions
        </Text>
        <Text dimColor> ({items.length} questions)</Text>
        <Text dimColor> [</Text>
        <Text color="yellow">{STATUS_LABELS[statusFilter]}</Text>
        <Text dimColor>] [</Text>
        <Text color="cyan">{currentGroupLabel}</Text>
        <Text dimColor>]</Text>
        <Text dimColor>
          {" "}
          Page {page + 1}/{totalPages}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(80)}</Text>

      {pageItems.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No questions found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {pageItems.map((item, i) => {
            const isSelected = i === cursor;
            const status =
              STATUS_ICONS[item.status] || STATUS_ICONS.not_started;
            const title = truncateToWidth(
              item.question_content || "(empty)",
              34,
            );
            const group = truncateToWidth(item.group_title || "", 8);
            const count = parseAnswerIds(item.answers).length;
            const time = formatRelativeTime(item.update_time);

            return (
              <Box key={item.id}>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {isSelected ? "❯" : " "} {padEnd(`#${item.id}`, 5)}
                </Text>
                <Text color={status.color}>{status.icon} </Text>
                <Text color={isSelected ? "white" : undefined}>
                  {padEnd(title, 35)}
                </Text>
                <Text color={item.group_color || "gray"} dimColor={!isSelected}>
                  {padEnd(group, 9)}
                </Text>
                <Text color={count > 0 ? "cyan" : "gray"}>
                  {padEnd(`${count} 答案`, 7)}
                </Text>
                {item.status === "resolved" && <Text color="green"> ✓</Text>}
                <Text dimColor> {time}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Text dimColor>{"─".repeat(80)}</Text>
      {message ? (
        <Text color="green">{message}</Text>
      ) : (
        <Text dimColor>
          ↑↓/jk nav · s status · g group · n/p page · Enter detail · r refresh ·
          Esc back
        </Text>
      )}
    </Box>
  );
}
