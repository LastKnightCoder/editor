import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { runArticleEdit } from "../../article/edit.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../../utils/text.js";

interface ArticleRow {
  id: number;
  title: string;
  author: string;
  create_time: number;
  update_time: number;
  tags: string;
  is_top: number;
  is_delete: number;
}

const PAGE_SIZE = 15;

function queryArticles(tagFilter: string, searchTerm: string): ArticleRow[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  let sql = `
    SELECT a.id, a.title, a.author, a.create_time, a.update_time, a.tags, a.is_top, a.is_delete
    FROM articles a
    WHERE a.is_delete = 0
  `;
  const params: unknown[] = [];

  if (searchTerm) {
    sql += " AND a.title LIKE ?";
    params.push(`%${searchTerm}%`);
  }

  sql += " ORDER BY a.is_top DESC, a.update_time DESC LIMIT 200";

  let articles = da.query<ArticleRow>(sql, ...params);

  if (tagFilter) {
    const filter = tagFilter.toLowerCase();
    articles = articles.filter((article) => {
      try {
        const tags = JSON.parse(article.tags) as string[];
        return tags.some((t) => t.toLowerCase().includes(filter));
      } catch {
        return false;
      }
    });
  }

  return articles;
}

export function ArticleListView({
  onBack,
  onShowArticle,
}: {
  onBack: () => void;
  onShowArticle: (articleId: number) => void;
}) {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);
  const [tagSearch, setTagSearch] = useState("");
  const [titleSearch, setTitleSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"tag" | "title" | null>(null);
  const [message, setMessage] = useState("");

  const loadArticles = useCallback(() => {
    try {
      const result = queryArticles(tagSearch, titleSearch);
      setArticles(result);
      setCursor(0);
      setPage(0);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }, [tagSearch, titleSearch]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
  const pageArticles = articles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape || key.return) {
        setSearchMode(null);
        return;
      }
      if (key.backspace || key.delete) {
        if (searchMode === "tag") setTagSearch((s) => s.slice(0, -1));
        else setTitleSearch((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl) {
        if (searchMode === "tag") setTagSearch((s) => s + input);
        else setTitleSearch((s) => s + input);
      }
      return;
    }

    if (key.escape || input === "q") {
      closeDataAccess();
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : pageArticles.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < pageArticles.length - 1 ? c + 1 : 0));
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
    } else if (input === "/") {
      setSearchMode("title");
    } else if (input === "t") {
      setSearchMode("tag");
    } else if (key.return) {
      const article = pageArticles[cursor];
      if (article) {
        closeDataAccess();
        onShowArticle(article.id);
      }
    } else if (input === "e") {
      const article = pageArticles[cursor];
      if (article) {
        setMessage(`Opening article #${article.id}...`);
        runArticleEdit(article.id).catch(() => {
          setMessage("Failed to open editor");
          setTimeout(() => setMessage(""), 2000);
        });
      }
    } else if (input === "r") {
      loadArticles();
      setMessage("Refreshed");
      setTimeout(() => setMessage(""), 1500);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Article List
        </Text>
        <Text dimColor> ({articles.length} articles)</Text>
        {titleSearch && <Text dimColor> [Search: {titleSearch}]</Text>}
        {tagSearch && <Text dimColor> [Tag: {tagSearch}]</Text>}
        <Text dimColor>
          {" "}
          Page {page + 1}/{totalPages}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(80)}</Text>

      {searchMode ? (
        <Box>
          <Text color="yellow">
            {searchMode === "title" ? "Search title: " : "Search tag: "}
          </Text>
          <Text>{searchMode === "title" ? titleSearch : tagSearch}</Text>
          <Text dimColor>█</Text>
        </Box>
      ) : null}

      {pageArticles.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No articles found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {pageArticles.map((article, i) => {
            const isSelected = i === cursor;
            const tags = (() => {
              try {
                return JSON.parse(article.tags);
              } catch {
                return [];
              }
            })() as string[];
            const title = truncateToWidth(article.title || "(untitled)", 36);
            const tagStr = truncateToWidth(tags.slice(0, 3).join(", "), 20);
            const time = formatRelativeTime(article.update_time);

            return (
              <Box key={article.id}>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {isSelected ? "❯" : " "} {padEnd(`#${article.id}`, 6)}
                </Text>
                <Text
                  color={
                    isSelected ? "white" : article.is_top ? "yellow" : undefined
                  }
                >
                  {padEnd(title, 37)}
                </Text>
                <Text dimColor>{padEnd(article.author || "", 10)}</Text>
                <Text color="blue"> {padEnd(tagStr, 21)}</Text>
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
          ↑↓/jk navigate · Enter view · e edit · / search title · t search tag ·
          n/p page · r refresh · Esc back
        </Text>
      )}
    </Box>
  );
}
