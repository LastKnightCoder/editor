import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { SlateRenderer } from "../../../ui/slate-renderer/index.js";
import {
  parseSlateContent,
  type ParseResult,
} from "../../../ui/slate-renderer/parse.js";
import { runCardEdit } from "../../card/edit.js";

interface CardRow {
  id: number;
  create_time: number;
  update_time: number;
  tags: string;
  links: string;
  category: string;
  is_top: number;
  content: string | null;
  count: number | null;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

export function CardDetailView({
  cardId,
  onBack,
}: {
  cardId: number;
  onBack: () => void;
}) {
  const [card, setCard] = useState<CardRow | null>(null);
  const [contentResult, setContentResult] = useState<ParseResult>({
    status: "empty",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const dbName = getActiveDbName();
      const da = getDataAccess(dbName);
      const row = da.queryOne<CardRow>(
        `SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.is_top,
                ct.content, ct.count
         FROM cards c
         LEFT JOIN contents ct ON c.content_id = ct.id
         WHERE c.id = ?`,
        cardId,
      );

      if (!row) {
        setError(`Card #${cardId} not found.`);
        return;
      }

      setCard(row);
      setContentResult(parseSlateContent(row.content));
    } catch (e: any) {
      setError(e.message);
    }
  }, [cardId]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }
    if (input === "e") {
      runCardEdit(cardId);
      setMessage("Opening in editor...");
      setTimeout(() => setMessage(""), 2000);
    }
  });

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
        <Text dimColor>Press Esc to go back</Text>
      </Box>
    );
  }

  if (!card) {
    return <Text dimColor>Loading...</Text>;
  }

  const tags = (() => {
    try {
      return JSON.parse(card.tags);
    } catch {
      return [];
    }
  })() as string[];
  const links = (() => {
    try {
      return JSON.parse(card.links);
    } catch {
      return [];
    }
  })() as number[];

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Card #{card.id}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(60)}</Text>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Box width={12}>
            <Text dimColor>Category</Text>
          </Box>
          <Text>{card.category}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Tags</Text>
          </Box>
          <Text color="blue">
            {tags.length > 0 ? tags.join(", ") : "(none)"}
          </Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Links</Text>
          </Box>
          <Text>
            {links.length > 0 ? links.map((l) => `#${l}`).join(", ") : "(none)"}
          </Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Pinned</Text>
          </Box>
          <Text>{card.is_top ? "Yes" : "No"}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Words</Text>
          </Box>
          <Text>{card.count ?? 0}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatDate(card.create_time)}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatDate(card.update_time)}</Text>
        </Box>
      </Box>
      <Text dimColor>{"─".repeat(60)}</Text>
      <Box marginTop={1} flexDirection="column">
        {contentResult.status === "ok" ? (
          <SlateRenderer nodes={contentResult.nodes} />
        ) : contentResult.status === "invalid" ? (
          <Text color="red">({contentResult.message})</Text>
        ) : (
          <Text dimColor>(empty content)</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{"─".repeat(60)}</Text>
      </Box>
      {message ? (
        <Text color="green">{message}</Text>
      ) : (
        <Text dimColor>e edit · Esc/q back</Text>
      )}
    </Box>
  );
}
