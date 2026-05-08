import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { getMarkdown } from "@tau/slate-markdown";
import { runArticleEdit } from "../../article/edit.js";
import { formatDate } from "../../../utils/text.js";

interface ArticleRow {
  id: number;
  title: string;
  author: string;
  create_time: number;
  update_time: number;
  tags: string;
  links: string;
  is_top: number;
  is_delete: number;
  content: string | null;
  count: number | null;
}

export function ArticleDetailView({
  articleId,
  onBack,
}: {
  articleId: number;
  onBack: () => void;
}) {
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const dbName = getActiveDbName();
      const da = getDataAccess(dbName);
      const row = da.queryOne<ArticleRow>(
        `SELECT a.id, a.title, a.author, a.create_time, a.update_time, a.tags, a.links,
                a.is_top, a.is_delete, ct.content, ct.count
         FROM articles a
         LEFT JOIN contents ct ON a.content_id = ct.id
         WHERE a.id = ?`,
        articleId,
      );

      if (!row) {
        setError(`Article #${articleId} not found.`);
        return;
      }

      setArticle(row);

      if (row.content) {
        try {
          const nodes = JSON.parse(row.content);
          setMarkdown(getMarkdown(nodes));
        } catch {
          setMarkdown("(failed to parse content)");
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [articleId]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }
    if (input === "e") {
      setMessage("Opening in editor...");
      runArticleEdit(articleId).catch(() => {
        setMessage("Failed to open editor");
        setTimeout(() => setMessage(""), 2000);
      });
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

  if (!article) {
    return <Text dimColor>Loading...</Text>;
  }

  const tags = (() => {
    try {
      if (!article.tags) return [];
      return JSON.parse(article.tags);
    } catch {
      return [];
    }
  })() as string[];
  const links = (() => {
    try {
      if (!article.links) return [];
      return JSON.parse(article.links);
    } catch {
      return [];
    }
  })() as number[];

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          {article.title || "(untitled)"}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(60)}</Text>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Box width={12}>
            <Text dimColor>Author</Text>
          </Box>
          <Text>{article.author || "(none)"}</Text>
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
          <Text>{article.is_top ? "Yes" : "No"}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Words</Text>
          </Box>
          <Text>{article.count ?? 0}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatDate(article.create_time)}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatDate(article.update_time)}</Text>
        </Box>
      </Box>
      <Text dimColor>{"─".repeat(60)}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>{markdown || "(empty content)"}</Text>
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
