import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { parseAnswerIds } from "../../../utils/todo-question-helpers.js";
import { formatRelativeTime, extractPlainText } from "../../../utils/text.js";

interface AnswerContentRow {
  id: number;
  content: string | null;
  create_time: number;
  update_time: number;
}

export function AnswerDetailView({
  questionId,
  answerIndex,
  onBack,
}: {
  questionId: number;
  answerIndex: number;
  onBack: () => void;
}) {
  const [answer, setAnswer] = useState<AnswerContentRow | null>(null);
  const [questionTitle, setQuestionTitle] = useState("");
  const [scroll, setScroll] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadAnswer();
  }, [questionId, answerIndex]);

  function loadAnswer() {
    try {
      const dbName = getActiveDbName();
      const da = getDataAccess(dbName);

      const q = da.queryOne<{
        question_content: string | null;
        answers: string;
      }>(
        `SELECT question_content, answers FROM questions WHERE id = ?`,
        questionId,
      );

      if (!q) {
        setMessage("Question not found");
        return;
      }

      setQuestionTitle(q.question_content || "(empty)");

      const answerIds = parseAnswerIds(q.answers);

      if (answerIndex >= answerIds.length) {
        setMessage("Answer not found");
        return;
      }

      const contentId = answerIds[answerIndex];
      const row = da.queryOne<AnswerContentRow>(
        `SELECT id, content, create_time, update_time FROM contents WHERE id = ?`,
        contentId,
      );

      if (!row) {
        setMessage("Answer content not found");
        return;
      }

      setAnswer(row);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }

  const plainText = answer?.content ? extractPlainText(answer.content) : "";
  const lines = plainText.split("\n");
  const maxScroll = Math.max(0, lines.length - 20);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      closeDataAccess();
      onBack();
      return;
    }
    if (key.upArrow || input === "k") {
      setScroll((s) => Math.max(0, s - 1));
    } else if (key.downArrow || input === "j") {
      setScroll((s) => Math.min(maxScroll, s + 1));
    }
  });

  if (message && !answer) {
    return (
      <Box flexDirection="column">
        <Text color="red">{message}</Text>
        <Text dimColor>Esc/q back</Text>
      </Box>
    );
  }

  if (!answer) {
    return (
      <Box>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  const visibleLines = lines.slice(scroll, scroll + 20);

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Answer #{answerIndex + 1}
        </Text>
        <Text dimColor> for Question #{questionId}</Text>
      </Box>
      <Text dimColor italic>
        {questionTitle}
      </Text>
      <Text dimColor>{"─".repeat(68)}</Text>

      <Box flexDirection="column" marginY={0}>
        <Box>
          <Box width={12}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatRelativeTime(answer.create_time)}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatRelativeTime(answer.update_time)}</Text>
        </Box>
      </Box>

      <Text dimColor>{"─".repeat(68)}</Text>

      <Box flexDirection="column">
        {visibleLines.map((line, i) => (
          <Text key={i}>{line || " "}</Text>
        ))}
      </Box>

      {lines.length > 20 && (
        <Text dimColor>
          {"─".repeat(68)}
          {"\n"}[{scroll + 1}-{Math.min(scroll + 20, lines.length)}/
          {lines.length} lines]
        </Text>
      )}

      <Text dimColor>{"─".repeat(68)}</Text>
      <Text dimColor>↑↓/jk scroll · Esc/q back</Text>
    </Box>
  );
}
