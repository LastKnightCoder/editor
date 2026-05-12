import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import {
  formatRelativeTime,
  extractPlainText,
  truncateToWidth,
} from "../../utils/text.js";
import {
  parseAnswerIds,
  fetchAnswerContents,
} from "../../utils/todo-question-helpers.js";

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

interface ContentRow {
  id: number;
  content: string | null;
  create_time: number;
  update_time: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: "○ 未开始", color: "gray" },
  in_progress: { label: "◐ 进行中", color: "yellow" },
  resolved: { label: "● 已解决", color: "green" },
};

function QuestionShowOutput({
  question,
  answers,
}: {
  question: QuestionDetailRow;
  answers: ContentRow[];
}) {
  const status = STATUS_LABELS[question.status] || STATUS_LABELS.not_started;

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Question #{question.id}:
        </Text>
        <Text bold> {question.question_content || "(empty)"}</Text>
      </Box>
      <Text dimColor>{"─".repeat(64)}</Text>

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

      {question.description && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{"─".repeat(64)}</Text>
          <Text dimColor>Description:</Text>
          <Text>
            {" "}
            {truncateToWidth(extractPlainText(question.description), 60)}
          </Text>
        </Box>
      )}

      {answers.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{"─".repeat(64)}</Text>
          <Text dimColor>Answers:</Text>
          {answers.map((ans, i) => {
            const text = ans.content
              ? extractPlainText(ans.content)
              : "(empty)";
            const preview = truncateToWidth(text, 68);
            return (
              <Box
                key={ans.id}
                marginTop={i > 0 ? 1 : 0}
                flexDirection="column"
              >
                <Box>
                  <Text color="cyan">{`  ${i + 1}. `}</Text>
                  <Text>{preview}</Text>
                </Box>
                <Text dimColor> {formatRelativeTime(ans.update_time)}</Text>
              </Box>
            );
          })}
        </Box>
      )}
      <Text dimColor>{"─".repeat(64)}</Text>
    </Box>
  );
}

export async function runQuestionShow(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    console.log("Error: ID must be a positive integer.");
    return;
  }

  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  try {
    const question = da.queryOne<QuestionDetailRow>(
      `SELECT q.id, q.question_content, q.answers, q.group_id, q.status,
              q.description, q.create_time, q.update_time, q.resolved_time,
              qg.title AS group_title, qg.color AS group_color
       FROM questions q
       LEFT JOIN question_group qg ON q.group_id = qg.id
       WHERE q.id = ?`,
      id,
    );

    if (!question) {
      console.log(`Error: Question #${id} not found.`);
      return;
    }

    const answerIds = parseAnswerIds(question.answers);
    const answers = fetchAnswerContents(answerIds) as ContentRow[];

    const { waitUntilExit } = render(
      <QuestionShowOutput question={question} answers={answers} />,
    );
    await waitUntilExit();
  } finally {
    closeDataAccess();
  }
}
