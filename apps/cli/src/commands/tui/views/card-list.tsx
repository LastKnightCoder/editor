import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { runCardEdit } from "../../card/edit.js";

interface CardRow {
  id: number;
  create_time: number;
  update_time: number;
  tags: string;
  category: string;
  is_top: number;
  content: string | null;
}

const CATEGORIES = ["all", "permanent", "temporary", "theme", "literature"];
const CATEGORY_LABELS: Record<string, string> = {
  all: "全部",
  permanent: "永久",
  temporary: "闪念",
  theme: "主题",
  literature: "文献",
};
const PAGE_SIZE = 15;

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

function getCategoryColor(category: string): string {
  switch (category) {
    case "permanent":
      return "green";
    case "temporary":
      return "yellow";
    case "theme":
      return "cyan";
    case "literature":
      return "magenta";
    default:
      return "gray";
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

function padEnd(str: string, targetWidth: number): string {
  const w = getStringWidth(str);
  if (w >= targetWidth) return str;
  return str + " ".repeat(targetWidth - w);
}

function queryCards(category: string, tagFilter: string): CardRow[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  let sql = `
    SELECT c.id, c.create_time, c.update_time, c.tags, c.category, c.is_top,
           ct.content
    FROM cards c
    LEFT JOIN contents ct ON c.content_id = ct.id
  `;
  const params: unknown[] = [];

  if (category !== "all") {
    sql += " WHERE c.category = ?";
    params.push(category);
  }

  sql += " ORDER BY c.is_top DESC, c.update_time DESC";
  sql += " LIMIT 200";

  let cards = da.query<CardRow>(sql, ...params);

  if (tagFilter) {
    const filter = tagFilter.toLowerCase();
    cards = cards.filter((card) => {
      try {
        const tags = JSON.parse(card.tags) as string[];
        return tags.some((t) => t.toLowerCase().includes(filter));
      } catch {
        return false;
      }
    });
  }

  return cards;
}

export function CardListView({
  onBack,
  onShowCard,
}: {
  onBack: () => void;
  onShowCard: (cardId: number) => void;
}) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [tagSearch, setTagSearch] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [message, setMessage] = useState("");

  const category = CATEGORIES[categoryIndex];

  const loadCards = useCallback(() => {
    try {
      const result = queryCards(category, tagSearch);
      setCards(result);
      setCursor(0);
      setPage(0);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }, [category, tagSearch]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const pageCards = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape || key.return) {
        setSearchMode(false);
        return;
      }
      if (key.backspace || key.delete) {
        setTagSearch((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl) {
        setTagSearch((s) => s + input);
      }
      return;
    }

    if (key.escape) {
      closeDataAccess();
      onBack();
      return;
    }

    if (input === "q") {
      closeDataAccess();
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : pageCards.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < pageCards.length - 1 ? c + 1 : 0));
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
    } else if (input === "f") {
      setCategoryIndex((i) => (i + 1) % CATEGORIES.length);
    } else if (input === "/") {
      setSearchMode(true);
    } else if (key.return) {
      const card = pageCards[cursor];
      if (card) {
        closeDataAccess();
        onShowCard(card.id);
      }
    } else if (input === "e") {
      const card = pageCards[cursor];
      if (card) {
        runCardEdit(card.id);
        setMessage(`Opening card #${card.id}...`);
        setTimeout(() => setMessage(""), 2000);
      }
    } else if (input === "r") {
      loadCards();
      setMessage("Refreshed");
      setTimeout(() => setMessage(""), 1500);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Card List
        </Text>
        <Text dimColor> ({cards.length} cards) [Category: </Text>
        <Text color={getCategoryColor(category)}>
          {CATEGORY_LABELS[category]}
        </Text>
        <Text dimColor>]</Text>
        {tagSearch && <Text dimColor> [Tag: {tagSearch}]</Text>}
        <Text dimColor>
          {" "}
          Page {page + 1}/{totalPages}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(80)}</Text>

      {searchMode ? (
        <Box>
          <Text color="yellow">Search tag: </Text>
          <Text>{tagSearch}</Text>
          <Text dimColor>█</Text>
        </Box>
      ) : null}

      {pageCards.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No cards found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {pageCards.map((card, i) => {
            const isSelected = i === cursor;
            const tags = (() => {
              try {
                return JSON.parse(card.tags);
              } catch {
                return [];
              }
            })() as string[];
            const preview = truncateToWidth(extractPlainText(card.content), 44);
            const time = formatRelativeTime(card.update_time);
            const tagStr = truncateToWidth(tags.slice(0, 3).join(", "), 20);

            return (
              <Box key={card.id}>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {isSelected ? "❯" : " "} {padEnd(`#${card.id}`, 6)}
                </Text>
                <Text color={getCategoryColor(card.category)}>
                  {padEnd(CATEGORY_LABELS[card.category] || card.category, 5)}
                </Text>
                <Text color={isSelected ? "white" : undefined}>
                  {" "}
                  {padEnd(preview || "(empty)", 45)}
                </Text>
                <Text color="blue">{padEnd(tagStr, 21)}</Text>
                <Text dimColor>{time}</Text>
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
          ↑↓/jk navigate · Enter view · e edit · f filter · / search tag · n/p
          page · r refresh · Esc back
        </Text>
      )}
    </Box>
  );
}
