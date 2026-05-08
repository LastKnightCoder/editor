import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../utils/text.js";

interface ProjectRow {
  id: number;
  create_time: number;
  update_time: number;
  title: string;
  children: string;
  archived: number;
  pinned: number;
  project_type: string;
}

interface ListOptions {
  type?: string;
  archived?: boolean;
  pinned?: boolean;
  limit?: string;
}

function getTypeBadge(type: string): { text: string; color: string } {
  switch (type) {
    case "document-tree":
      return { text: "文档树", color: "cyan" };
    case "data-table":
      return { text: "数据表", color: "yellow" };
    case "vibe-learning":
      return { text: "学习", color: "magenta" };
    default:
      return { text: type, color: "gray" };
  }
}

const COL = { id: 6, title: 30, type: 8, items: 6, pinned: 4, time: 10 };

function ProjectListView({ projects }: { projects: ProjectRow[] }) {
  if (projects.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No projects found.</Text>
      </Box>
    );
  }

  const headerLine = `┌${"─".repeat(COL.id + 2)}┬${"─".repeat(COL.title + 2)}┬${"─".repeat(COL.type + 2)}┬${"─".repeat(COL.items + 2)}┬${"─".repeat(COL.pinned + 2)}┬${"─".repeat(COL.time + 2)}┐`;
  const sepLine = `├${"─".repeat(COL.id + 2)}┼${"─".repeat(COL.title + 2)}┼${"─".repeat(COL.type + 2)}┼${"─".repeat(COL.items + 2)}┼${"─".repeat(COL.pinned + 2)}┼${"─".repeat(COL.time + 2)}┤`;
  const footerLine = `└${"─".repeat(COL.id + 2)}┴${"─".repeat(COL.title + 2)}┴${"─".repeat(COL.type + 2)}┴${"─".repeat(COL.items + 2)}┴${"─".repeat(COL.pinned + 2)}┴${"─".repeat(COL.time + 2)}┘`;

  const rows = projects.map((p) => {
    const badge = getTypeBadge(p.project_type);
    const childCount = (() => {
      try {
        return JSON.parse(p.children).length;
      } catch {
        return 0;
      }
    })();
    return {
      id: p.id,
      title: truncateToWidth(p.title || "(untitled)", COL.title),
      badge,
      items: String(childCount),
      pinned: p.pinned ? "Y" : "",
      time: formatRelativeTime(p.update_time),
    };
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Projects ({projects.length})
        </Text>
      </Box>
      <Text dimColor>{headerLine}</Text>
      <Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" ID", COL.id + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 标题", COL.title + 2)}</Text>
        <Text dimColor>│</Text>
        <Text bold>{padEnd(" 类型", COL.type + 2)}</Text>
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
            <Text color={row.badge.color}>
              {" "}
              {padEnd(row.badge.text, COL.type + 1)}
            </Text>
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

export async function runProjectList(options: ListOptions) {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  let sql = `
    SELECT id, create_time, update_time, title, children, archived, pinned, project_type
    FROM project
  `;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.archived) {
    conditions.push("archived = 1");
  } else {
    conditions.push("archived = 0");
  }

  if (options.pinned) {
    conditions.push("pinned = 1");
  }

  if (options.type) {
    conditions.push("project_type = ?");
    params.push(options.type);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY pinned DESC, update_time DESC";

  const limit = parseInt(options.limit || "20", 10);
  sql += ` LIMIT ?`;
  params.push(limit);

  const projects = da.query<ProjectRow>(sql, ...params);

  closeDataAccess();

  render(<ProjectListView projects={projects} />);
}
