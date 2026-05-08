import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../utils/text.js";

interface ArticleRow {
  id: number;
  title: string;
  author: string;
  create_time: number;
  update_time: number;
  tags: string;
  is_top: number;
  is_delete: number;
  count: number | null;
}

interface ListOptions {
  tag?: string;
  search?: string;
  limit?: string;
  deleted?: boolean;
}

const COL = { id: 6, title: 30, author: 10, tags: 20, time: 10 };

function ArticleListView({ articles }: { articles: ArticleRow[] }) {
  if (articles.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No articles found.</Text>
      </Box>
    );
  }

  const headerLine = `┌${"─".repeat(COL.id + 2)}┬${"─".repeat(COL.title + 2)}┬${"─".repeat(COL.author + 2)}┬${"─".repeat(COL.tags + 2)}┬${"─".repeat(COL.time + 2)}┐`;
  const sepLine = `├${"─".repeat(COL.id + 2)}┼${"─".repeat(COL.title + 2)}┼${"─".repeat(COL.author + 2)}┼${"─".repeat(COL.tags + 2)}┼${"─".repeat(COL.time + 2)}┤`;
  const footerLine = `└${"─".repeat(COL.id + 2)}┴${"─".repeat(COL.title + 2)}┴${"─".repeat(COL.author + 2)}┴${"─".repeat(COL.tags + 2)}┴${"─".repeat(COL.time + 2)}┘`;

  const rows = articles.map((a) => {
    const tags = (() => {
      try {
        return JSON.parse(a.tags);
      } catch {
        return [];
      }
    })() as string[];
    const title = truncateToWidth(a.title || "(untitled)", COL.title);
    const author = truncateToWidth(a.author || "", COL.author);
    const tagStr = truncateToWidth(tags.slice(0, 3).join(", "), COL.tags);
    const time = formatRelativeTime(a.update_time);
    return {
      id: a.id,
      title,
      author,
      tags: tagStr,
      time,
      isTop: a.is_top,
      isDelete: a.is_delete,
    };
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Articles ({articles.length})
        </Text>
      </Box>
      <Text dimColor>{headerLine}</Text>
      <Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" ID", COL.id + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 标题", COL.title + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 作者", COL.author + 2)}</Text>
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
            <Text
              color={row.isDelete ? "red" : row.isTop ? "yellow" : undefined}
            >
              {" "}
              {padEnd(row.title, COL.title + 1)}
            </Text>
            <Text dimColor>│</Text>
            <Text dimColor> {padEnd(row.author, COL.author + 1)}</Text>
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

export async function runArticleList(options: ListOptions) {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  let sql = `
    SELECT a.id, a.title, a.author, a.create_time, a.update_time, a.tags,
           a.is_top, a.is_delete, ct.count
    FROM articles a
    LEFT JOIN contents ct ON a.content_id = ct.id
  `;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!options.deleted) {
    conditions.push("a.is_delete = 0");
  }

  if (options.search) {
    conditions.push("a.title LIKE ?");
    params.push(`%${options.search}%`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY a.is_top DESC, a.update_time DESC";

  const limit = parseInt(options.limit || "20", 10);
  sql += ` LIMIT ?`;
  params.push(limit);

  let articles = da.query<ArticleRow>(sql, ...params);

  if (options.tag) {
    const tagFilter = options.tag.toLowerCase();
    articles = articles.filter((article) => {
      try {
        const tags = JSON.parse(article.tags) as string[];
        return tags.some((t) => t.toLowerCase().includes(tagFilter));
      } catch {
        return false;
      }
    });
  }

  closeDataAccess();

  render(<ArticleListView articles={articles} />);
}
