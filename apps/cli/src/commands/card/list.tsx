import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import { formatRelativeTime, extractPlainText, truncateToWidth, padEnd } from "../../utils/text.js";

interface CardRow {
  id: number;
  create_time: number;
  update_time: number;
  tags: string;
  is_top: number;
  content: string | null;
  count: number | null;
}

interface ListOptions {
  tag?: string;
  limit?: string;
}

const COL = { id: 6, content: 40, tags: 24, time: 10 };

function CardListView({ cards }: { cards: CardRow[] }) {
  if (cards.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No cards found.</Text>
      </Box>
    );
  }

  const headerLine = `┌${"─".repeat(COL.id + 2)}┬${"─".repeat(COL.content + 2)}┬${"─".repeat(COL.tags + 2)}┬${"─".repeat(COL.time + 2)}┐`;
  const sepLine = `├${"─".repeat(COL.id + 2)}┼${"─".repeat(COL.content + 2)}┼${"─".repeat(COL.tags + 2)}┼${"─".repeat(COL.time + 2)}┤`;
  const footerLine = `└${"─".repeat(COL.id + 2)}┴${"─".repeat(COL.content + 2)}┴${"─".repeat(COL.tags + 2)}┴${"─".repeat(COL.time + 2)}┘`;

  const rows = cards.map(card => {
    const tags = (() => {
      try {
        return JSON.parse(card.tags);
      } catch {
        return [];
      }
    })() as string[];
    const preview = extractPlainText(card.content);
    const truncatedPreview = truncateToWidth(preview, COL.content) || "(empty)";
    const time = formatRelativeTime(card.update_time);
    const tagStr = tags.length > 0 ? tags.slice(0, 3).join(", ") : "";
    const truncatedTags = truncateToWidth(tagStr, COL.tags);
    return {
      id: card.id,
      preview: truncatedPreview,
      time,
      tags: truncatedTags,
      isTop: card.is_top,
    };
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Cards ({cards.length})
        </Text>
      </Box>
      <Text dimColor>{headerLine}</Text>
      <Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" ID", COL.id + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 内容", COL.content + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 标签", COL.tags + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 时间", COL.time + 2)}</Text>
        <Text dimColor>│</Text>
      </Text>
      <Text dimColor>{sepLine}</Text>
      {rows.map((row, i) => (
        <React.Fragment key={row.id}>
          <Text>
            <Text dimColor>│</Text>
            <Text> {padEnd(`#${row.id}`, COL.id + 1)}</Text>
            <Text dimColor>│</Text>
            <Text> {padEnd(row.preview, COL.content + 1)}</Text>
            <Text dimColor>│</Text>
            <Text color="blue"> {padEnd(row.tags, COL.tags + 1)}</Text>
            <Text dimColor>│</Text>
            <Text dimColor> {padEnd(row.time, COL.time + 1)}</Text>
            <Text dimColor>│</Text>
          </Text>
          {i < rows.length - 1 && <Text dimColor>{sepLine}</Text>}
        </React.Fragment>
      ))}
      <Text dimColor>{footerLine}</Text>
    </Box>
  );
}

export async function runCardList(options: ListOptions) {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  let sql = `
    SELECT c.id, c.create_time, c.update_time, c.tags, c.is_top,
           ct.content, ct.count
    FROM cards c
    LEFT JOIN contents ct ON c.content_id = ct.id
  `;

  sql += " ORDER BY c.is_top DESC, c.update_time DESC";

  const limit = parseInt(options.limit || "20", 10);
  sql += ` LIMIT ?`;

  let cards = da.query<CardRow>(sql, limit);

  if (options.tag) {
    const tagFilter = options.tag.toLowerCase();
    cards = cards.filter(card => {
      try {
        const tags = JSON.parse(card.tags) as string[];
        return tags.some(t => t.toLowerCase().includes(tagFilter));
      } catch {
        return false;
      }
    });
  }

  closeDataAccess();

  render(<CardListView cards={cards} />);
}
