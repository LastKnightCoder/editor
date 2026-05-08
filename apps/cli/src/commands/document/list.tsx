import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../utils/text.js";

interface DocumentRow {
  id: number;
  create_time: number;
  update_time: number;
  title: string;
  children: string;
  is_top: number;
}

interface ListOptions {
  search?: string;
  limit?: string;
  top?: boolean;
}

const COL = { id: 6, title: 36, items: 6, pinned: 4, time: 10 };

function DocumentListView({ documents }: { documents: DocumentRow[] }) {
  if (documents.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No documents found.</Text>
      </Box>
    );
  }

  const headerLine = `┌${"─".repeat(COL.id + 2)}┬${"─".repeat(COL.title + 2)}┬${"─".repeat(COL.items + 2)}┬${"─".repeat(COL.pinned + 2)}┬${"─".repeat(COL.time + 2)}┐`;
  const sepLine = `├${"─".repeat(COL.id + 2)}┼${"─".repeat(COL.title + 2)}┼${"─".repeat(COL.items + 2)}┼${"─".repeat(COL.pinned + 2)}┼${"─".repeat(COL.time + 2)}┤`;
  const footerLine = `└${"─".repeat(COL.id + 2)}┴${"─".repeat(COL.title + 2)}┴${"─".repeat(COL.items + 2)}┴${"─".repeat(COL.pinned + 2)}┴${"─".repeat(COL.time + 2)}┘`;

  const rows = documents.map((d) => {
    const childCount = (() => {
      try {
        return JSON.parse(d.children).length;
      } catch {
        return 0;
      }
    })();
    return {
      id: d.id,
      title: truncateToWidth(d.title || "(untitled)", COL.title),
      items: String(childCount),
      pinned: d.is_top ? "Y" : "",
      time: formatRelativeTime(d.update_time),
    };
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Documents ({documents.length})
        </Text>
      </Box>
      <Text dimColor>{headerLine}</Text>
      <Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" ID", COL.id + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 标题", COL.title + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 项目", COL.items + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" Pin", COL.pinned + 2)}</Text>
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
            <Text> {padEnd(row.title, COL.title + 1)}</Text>
            <Text dimColor>│</Text>
            <Text> {padEnd(row.items, COL.items + 1)}</Text>
            <Text dimColor>│</Text>
            <Text color="yellow"> {padEnd(row.pinned, COL.pinned + 1)}</Text>
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

export async function runDocumentList(options: ListOptions) {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  let sql = `
    SELECT id, create_time, update_time, title, children, is_top
    FROM documents
  `;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.top) {
    conditions.push("is_top = 1");
  }

  if (options.search) {
    conditions.push("title LIKE ?");
    params.push(`%${options.search}%`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY is_top DESC, update_time DESC";

  const limit = parseInt(options.limit || "20", 10);
  sql += ` LIMIT ?`;
  params.push(limit);

  const documents = da.query<DocumentRow>(sql, ...params);

  closeDataAccess();

  render(<DocumentListView documents={documents} />);
}
