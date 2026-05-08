import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { runProjectEdit } from "../../project/edit.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../../utils/text.js";

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

const PROJECT_TYPES = ["all", "document-tree", "data-table", "vibe-learning"];
const TYPE_LABELS: Record<string, string> = {
  all: "全部",
  "document-tree": "文档树",
  "data-table": "数据表",
  "vibe-learning": "学习",
};
const PAGE_SIZE = 15;

function getTypeColor(type: string): string {
  switch (type) {
    case "document-tree":
      return "cyan";
    case "data-table":
      return "yellow";
    case "vibe-learning":
      return "magenta";
    default:
      return "gray";
  }
}

function queryProjects(
  typeFilter: string,
  showArchived: boolean,
): ProjectRow[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  let sql = `SELECT id, create_time, update_time, title, children, archived, pinned, project_type FROM project`;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!showArchived) {
    conditions.push("archived = 0");
  }

  if (typeFilter !== "all") {
    conditions.push("project_type = ?");
    params.push(typeFilter);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY pinned DESC, update_time DESC LIMIT 200";

  return da.query<ProjectRow>(sql, ...params);
}

export function ProjectListView({
  onBack,
  onShowProject,
}: {
  onBack: () => void;
  onShowProject: (projectId: number) => void;
}) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);
  const [typeIndex, setTypeIndex] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");

  const typeFilter = PROJECT_TYPES[typeIndex];

  const loadProjects = useCallback(() => {
    try {
      const result = queryProjects(typeFilter, showArchived);
      setProjects(result);
      setCursor(0);
      setPage(0);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }, [typeFilter, showArchived]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const pageProjects = projects.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      closeDataAccess();
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : pageProjects.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < pageProjects.length - 1 ? c + 1 : 0));
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
      setTypeIndex((i) => (i + 1) % PROJECT_TYPES.length);
    } else if (input === "a") {
      setShowArchived((v) => !v);
    } else if (key.return) {
      const project = pageProjects[cursor];
      if (project) {
        closeDataAccess();
        onShowProject(project.id);
      }
    } else if (input === "e") {
      const project = pageProjects[cursor];
      if (project) {
        setMessage(`Opening project #${project.id}...`);
        runProjectEdit(project.id).catch(() => {
          setMessage("Failed to open editor");
          setTimeout(() => setMessage(""), 2000);
        });
      }
    } else if (input === "r") {
      loadProjects();
      setMessage("Refreshed");
      setTimeout(() => setMessage(""), 1500);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Project List
        </Text>
        <Text dimColor> ({projects.length} projects) [Type: </Text>
        <Text color={getTypeColor(typeFilter)}>{TYPE_LABELS[typeFilter]}</Text>
        <Text dimColor>]</Text>
        {showArchived && <Text dimColor> [Archived]</Text>}
        <Text dimColor>
          {" "}
          Page {page + 1}/{totalPages}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(80)}</Text>

      {pageProjects.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No projects found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {pageProjects.map((project, i) => {
            const isSelected = i === cursor;
            const title = truncateToWidth(project.title || "(untitled)", 36);
            const childCount = (() => {
              try {
                return JSON.parse(project.children).length;
              } catch {
                return 0;
              }
            })();
            const time = formatRelativeTime(project.update_time);

            return (
              <Box key={project.id}>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {isSelected ? "❯" : " "} {padEnd(`#${project.id}`, 6)}
                </Text>
                <Text color={isSelected ? "white" : undefined}>
                  {padEnd(title, 37)}
                </Text>
                <Text color={getTypeColor(project.project_type)}>
                  {padEnd(
                    TYPE_LABELS[project.project_type] || project.project_type,
                    8,
                  )}
                </Text>
                <Text dimColor> {padEnd(`${childCount}项`, 6)}</Text>
                {project.pinned ? (
                  <Text color="yellow"> Pin </Text>
                ) : (
                  <Text> </Text>
                )}
                <Text dimColor> {time}</Text>
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
          ↑↓/jk navigate · Enter view · e edit · f filter type · a toggle
          archived · n/p page · r refresh · Esc back
        </Text>
      )}
    </Box>
  );
}
