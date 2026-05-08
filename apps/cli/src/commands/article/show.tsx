import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import { getMarkdown } from "@tau/slate-markdown";
import { Header, Divider } from "../../ui/components.js";
import { formatDate } from "../../utils/text.js";

interface ArticleRow {
  id: number;
  title: string;
  author: string;
  create_time: number;
  update_time: number;
  tags: string;
  links: string;
  banner_bg: string;
  is_top: number;
  is_delete: number;
  content: string | null;
  count: number | null;
  content_id: number;
}

function ArticleShowView({
  article,
  markdown,
}: {
  article: ArticleRow;
  markdown: string;
}) {
  const tags = (() => {
    try {
      return JSON.parse(article.tags);
    } catch {
      return [];
    }
  })() as string[];
  const links = (() => {
    try {
      return JSON.parse(article.links);
    } catch {
      return [];
    }
  })() as number[];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header>{article.title || "(untitled)"}</Header>
      <Divider width={60} />
      <Box flexDirection="column" gap={0} marginBottom={1}>
        <Box>
          <Box width={14}>
            <Text dimColor>Author</Text>
          </Box>
          <Text>{article.author || "(none)"}</Text>
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
          <Text>{article.is_top ? "Yes" : "No"}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Deleted</Text>
          </Box>
          <Text color={article.is_delete ? "red" : undefined}>
            {article.is_delete ? "Yes" : "No"}
          </Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Words</Text>
          </Box>
          <Text>{article.count ?? 0}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatDate(article.create_time)}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatDate(article.update_time)}</Text>
        </Box>
      </Box>
      <Divider width={60} />
      <Box marginTop={1}>
        <Text>{markdown || "(empty content)"}</Text>
      </Box>
    </Box>
  );
}

export async function runArticleShow(articleId: number) {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  const article = da.queryOne<ArticleRow>(
    `SELECT a.id, a.title, a.author, a.create_time, a.update_time, a.tags, a.links,
            a.banner_bg, a.is_top, a.is_delete, a.content_id,
            ct.content, ct.count
     FROM articles a
     LEFT JOIN contents ct ON a.content_id = ct.id
     WHERE a.id = ?`,
    articleId,
  );

  closeDataAccess();

  if (!article) {
    render(
      <Box paddingX={1}>
        <Text color="red">Article #{articleId} not found.</Text>
      </Box>,
    );
    return;
  }

  let markdown = "";
  if (article.content) {
    try {
      const nodes = JSON.parse(article.content);
      markdown = getMarkdown(nodes);
    } catch {
      markdown = "(failed to parse content)";
    }
  }

  render(<ArticleShowView article={article} markdown={markdown} />);
}
