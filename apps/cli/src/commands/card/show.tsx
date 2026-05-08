import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import { getMarkdown } from "@tau/slate-markdown";
import { Header, Divider } from "../../ui/components.js";
import { formatDate } from "../../utils/text.js";

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
  content_id: number;
}

function CardShowView({ card, markdown }: { card: CardRow; markdown: string }) {
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
    <Box flexDirection="column" paddingX={1}>
      <Header>Card #{card.id}</Header>
      <Divider width={60} />
      <Box flexDirection="column" gap={0} marginBottom={1}>
        <Box>
          <Box width={14}>
            <Text dimColor>Category</Text>
          </Box>
          <Text>{card.category}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Tags</Text>
          </Box>
          <Text color="blue">
            {tags.length > 0 ? tags.join(", ") : "(none)"}
          </Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Links</Text>
          </Box>
          <Text>{links.length > 0 ? links.join(", ") : "(none)"}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Pinned</Text>
          </Box>
          <Text>{card.is_top ? "Yes" : "No"}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Words</Text>
          </Box>
          <Text>{card.count ?? 0}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatDate(card.create_time)}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatDate(card.update_time)}</Text>
        </Box>
      </Box>
      <Divider width={60} />
      <Box marginTop={1}>
        <Text>{markdown || "(empty content)"}</Text>
      </Box>
    </Box>
  );
}

export async function runCardShow(cardId: number) {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  const card = da.queryOne<CardRow>(
    `SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.is_top, c.content_id,
            ct.content, ct.count
     FROM cards c
     LEFT JOIN contents ct ON c.content_id = ct.id
     WHERE c.id = ?`,
    cardId,
  );

  closeDataAccess();

  if (!card) {
    render(
      <Box paddingX={1}>
        <Text color="red">Card #{cardId} not found.</Text>
      </Box>,
    );
    return;
  }

  let markdown = "";
  if (card.content) {
    try {
      const nodes = JSON.parse(card.content);
      markdown = getMarkdown(nodes);
    } catch {
      markdown = "(failed to parse content)";
    }
  }

  render(<CardShowView card={card} markdown={markdown} />);
}
