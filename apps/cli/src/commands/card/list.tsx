import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";

interface CardRow {
  id: number;
  create_time: number;
  update_time: number;
  tags: string;
  category: string;
  is_top: number;
  content: string | null;
  count: number | null;
}

interface ListOptions {
  category?: string;
  tag?: string;
  limit?: string;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}

function getCategoryBadge(category: string): { text: string; color: string } {
  switch (category) {
    case "permanent":
      return { text: "永久", color: "green" };
    case "temporary":
      return { text: "闪念", color: "yellow" };
    case "theme":
      return { text: "主题", color: "cyan" };
    case "literature":
      return { text: "文献", color: "magenta" };
    default:
      return { text: category, color: "gray" };
  }
}

function extractPlainText(contentJson: string | null): string {
  if (!contentJson) return "";
  try {
    const nodes = JSON.parse(contentJson);
    const texts: string[] = [];
    const walk = (node: any) => {
      if (node.text) texts.push(node.text);
      if (node.children) node.children.forEach(walk);
    };
    nodes.forEach(walk);
    return texts.join("").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function getStringWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padEnd(str: string, targetWidth: number): string {
  const w = getStringWidth(str);
  if (w >= targetWidth) return str;
  return str + " ".repeat(targetWidth - w);
}

function truncateToWidth(str: string, maxWidth: number): string {
  let width = 0;
  let result = "";
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    const charW =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
        ? 2
        : 1;
    if (width + charW > maxWidth) break;
    result += ch;
    width += charW;
  }
  return result;
}

const COL = { id: 6, category: 6, content: 40, tags: 24, time: 10 };

function CardListView({ cards }: { cards: CardRow[] }) {
  if (cards.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No cards found.</Text>
      </Box>
    );
  }

  const headerLine = `┌${"─".repeat(COL.id + 2)}┬${"─".repeat(COL.category + 2)}┬${"─".repeat(COL.content + 2)}┬${"─".repeat(COL.tags + 2)}┬${"─".repeat(COL.time + 2)}┐`;
  const sepLine = `├${"─".repeat(COL.id + 2)}┼${"─".repeat(COL.category + 2)}┼${"─".repeat(COL.content + 2)}┼${"─".repeat(COL.tags + 2)}┼${"─".repeat(COL.time + 2)}┤`;
  const footerLine = `└${"─".repeat(COL.id + 2)}┴${"─".repeat(COL.category + 2)}┴${"─".repeat(COL.content + 2)}┴${"─".repeat(COL.tags + 2)}┴${"─".repeat(COL.time + 2)}┘`;

  const rows = cards.map((card) => {
    const badge = getCategoryBadge(card.category);
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
      badge,
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
        <Text bold>{padEnd(" 类型", COL.category + 2)}</Text>
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
            <Text color={row.badge.color}>
              {" "}
              {padEnd(row.badge.text, COL.category + 1)}
            </Text>
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
    SELECT c.id, c.create_time, c.update_time, c.tags, c.category, c.is_top,
           ct.content, ct.count
    FROM cards c
    LEFT JOIN contents ct ON c.content_id = ct.id
  `;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.category) {
    conditions.push("c.category = ?");
    params.push(options.category);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY c.is_top DESC, c.update_time DESC";

  const limit = parseInt(options.limit || "20", 10);
  sql += ` LIMIT ?`;
  params.push(limit);

  let cards = da.query<CardRow>(sql, ...params);

  if (options.tag) {
    const tagFilter = options.tag.toLowerCase();
    cards = cards.filter((card) => {
      try {
        const tags = JSON.parse(card.tags) as string[];
        return tags.some((t) => t.toLowerCase().includes(tagFilter));
      } catch {
        return false;
      }
    });
  }

  closeDataAccess();

  render(<CardListView cards={cards} />);
}
