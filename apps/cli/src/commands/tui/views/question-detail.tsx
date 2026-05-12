import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import {
  parseAnswerIds,
  fetchAnswerContents,
  type AnswerContent,
} from "../../../utils/todo-question-helpers.js";
import {
  formatRelativeTime,
  extractPlainText,
  truncateToWidth,
} from "../../../utils/text.js";

interface QuestionDetailRow {
  id: number;
  question_content: string | null;
  answers: string;
  group_id: number | null;
  status: string;
  description: string | null;
  create_time: number;
  update_time: number;
  resolved_time: number | null;
  group_title: string | null;
  group_color: string | null;
}

type AnswerRow = AnswerContent;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: "○ 未开始", color: "gray" },
  in_progress: { label: "◐ 进行中", color: "yellow" },
  resolved: { label: "● 已解决", color: "green" },
};

export function QuestionDetailView({
  questionId,
  onBack,
  onShowAnswer,
}: {
  questionId: number;
  onBack: () => void;
  onShowAnswer: (questionId: number, answerIndex: number) => void;
}) {
  const [question, setQuestion] = useState<QuestionDetailRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadDetail();
  }, [questionId]);

  function loadDetail() {
    try {
      const dbName = getActiveDbName();
      const da = getDataAccess(dbName);

      const row = da.queryOne<QuestionDetailRow>(
        `SELECT q.id, q.question_content, q.answers, q.group_id, q.status,
                q.description, q.create_time, q.update_time, q.resolved_time,
                qg.title AS group_title, qg.color AS group_color
         FROM questions q
         LEFT JOIN question_group qg ON q.group_id = qg.id
         WHERE q.id = ?`,
        questionId,
      );
      setQuestion(row || null);

      if (!row) {
        setNotFound(true);
        return;
      }

      const answerIds = parseAnswerIds(row.answers);
      setAnswers(fetchAnswerContents(answerIds));
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

    if (answers.length > 0) {
      if (key.upArrow || input === "k") {
        setCursor((c) => (c > 0 ? c - 1 : answers.length - 1));
      } else if (key.downArrow || input === "j") {
        setCursor((c) => (c < answers.length - 1 ? c + 1 : 0));
      } else if (key.return) {
        closeDataAccess();
        onShowAnswer(questionId, cursor);
      }
    }
  });

  if (notFound) {
    return (
      <Box flexDirection="column">
        <Text color="red">Question #{questionId} not found.</Text>
        <Text dimColor>Esc/q back</Text>
      </Box>
    );
  }

  if (!question) {
    return (
      <Box>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  const status = STATUS_LABELS[question.status] || STATUS_LABELS.not_started;
  const description = question.description
    ? truncateToWidth(extractPlainText(question.description), 64)
    : "";

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Question #{question.id}:
        </Text>
        <Text bold> {question.question_content || "(empty)"}</Text>
      </Box>
      <Text dimColor>{"─".repeat(68)}</Text>

      <Box flexDirection="column">
        <Box>
          <Box width={12}>
            <Text dimColor>Group</Text>
          </Box>
          <Text color={question.group_color || "white"}>
            {question.group_title || "—"}
          </Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Status</Text>
          </Box>
          <Text color={status.color}>{status.label}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Answers</Text>
          </Box>
          <Text>{answers.length} 个答案</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatRelativeTime(question.create_time)}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatRelativeTime(question.update_time)}</Text>
        </Box>
      </Box>

      {description && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{"─".repeat(68)}</Text>
          <Box>
            <Box width={12}>
              <Text dimColor>Description</Text>
            </Box>
            <Text>{description}</Text>
          </Box>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>{"─".repeat(68)}</Text>
        {answers.length === 0 ? (
          <Text dimColor>No answers yet.</Text>
        ) : (
          <Box flexDirection="column">
            <Text dimColor>Answers ({answers.length}):</Text>
            {answers.map((ans, i) => {
              const isSelected = i === cursor;
              const text = ans.content
                ? truncateToWidth(extractPlainText(ans.content), 54)
                : "(empty)";
              const time = formatRelativeTime(ans.update_time);

              return (
                <Box key={ans.id}>
                  <Text
                    color={isSelected ? "cyan" : undefined}
                    bold={isSelected}
                  >
                    {isSelected ? "❯" : " "} {`${i + 1}. `}
                  </Text>
                  <Text color={isSelected ? "white" : undefined}>{text}</Text>
                  <Text dimColor> {time}</Text>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <Text dimColor>{"─".repeat(68)}</Text>
      {message ? (
        <Text color="green">{message}</Text>
      ) : (
        <Text dimColor>
          {answers.length > 0
            ? "↑↓/jk answer · Enter view answer · Esc back"
            : "Esc/q back"}
        </Text>
      )}
    </Box>
  );
}
