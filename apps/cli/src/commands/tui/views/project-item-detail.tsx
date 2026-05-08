import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { getMarkdown } from "@tau/slate-markdown";
import { runProjectItemEdit } from "../../project-item/edit.js";
import { formatDate } from "../../../utils/text.js";
import { buildTreeLines, TreeNode } from "../../../utils/tree.js";

interface ProjectItemRow {
  id: number;
  title: string;
  create_time: number;
  update_time: number;
  project_item_type: string;
  children: string | null;
  content: string | null;
}

interface ChildItemRow {
  id: number;
  title: string;
  children: string;
  project_item_type: string;
}

export function ProjectItemDetailView({
  itemId,
  onBack,
  onShowProjectItem,
}: {
  itemId: number;
  onBack: () => void;
  onShowProjectItem?: (id: number) => void;
}) {
  const [item, setItem] = useState<ProjectItemRow | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [treeLines, setTreeLines] = useState<{ text: string; id: number }[]>(
    [],
  );
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const dbName = getActiveDbName();
      const da = getDataAccess(dbName);

      const row = da.queryOne<ProjectItemRow>(
        `SELECT pi.id, pi.title, pi.create_time, pi.update_time, pi.project_item_type, pi.children,
                ct.content
         FROM project_item pi
         LEFT JOIN contents ct ON pi.content_id = ct.id
         WHERE pi.id = ?`,
        itemId,
      );

      if (!row) {
        setError(`Project item #${itemId} not found.`);
        return;
      }

      setItem(row);

      if (row.content) {
        try {
          const nodes = JSON.parse(row.content);
          setMarkdown(getMarkdown(nodes));
        } catch {
          setMarkdown("(failed to parse content)");
        }
      }

      let childIds: number[] = [];
      try {
        if (row.children) {
          childIds = JSON.parse(row.children) as number[];
        }
      } catch {
        /* ignore parse error */
      }

      if (childIds.length > 0) {
        const placeholders = childIds.map(() => "?").join(",");
        const children = da.query<ChildItemRow>(
          `SELECT id, title, children, project_item_type FROM project_item WHERE id IN (${placeholders})`,
          ...childIds,
        );

        const nodeMap = new Map<number, TreeNode>();
        for (const child of children) {
          let grandChildren: number[] = [];
          try {
            grandChildren = JSON.parse(child.children) as number[];
          } catch {
            /* ignore parse error */
          }
          nodeMap.set(child.id, {
            id: child.id,
            title: child.title,
            type: child.project_item_type,
            children: grandChildren,
          });
        }

        setTreeLines(buildTreeLines(childIds, nodeMap));
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [itemId]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }
    if (input === "e") {
      setMessage("Opening in editor...");
      runProjectItemEdit(itemId).catch(() => {
        setMessage("Failed to open editor");
        setTimeout(() => setMessage(""), 2000);
      });
      return;
    }
    if (treeLines.length > 0) {
      if (key.upArrow || input === "k") {
        setCursor((c) => (c > 0 ? c - 1 : treeLines.length - 1));
      } else if (key.downArrow || input === "j") {
        setCursor((c) => (c < treeLines.length - 1 ? c + 1 : 0));
      } else if (key.return && onShowProjectItem) {
        const selected = treeLines[cursor];
        if (selected) {
          onShowProjectItem(selected.id);
        }
      }
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

  if (!item) {
    return <Text dimColor>Loading...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          {item.title || "(untitled)"}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(60)}</Text>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Box width={12}>
            <Text dimColor>Type</Text>
          </Box>
          <Text>{item.project_item_type || "document"}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Children</Text>
          </Box>
          <Text>{treeLines.length}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatDate(item.create_time)}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatDate(item.update_time)}</Text>
        </Box>
      </Box>
      {markdown && (
        <>
          <Text dimColor>{"─".repeat(60)}</Text>
          <Box marginTop={1} marginBottom={1} flexDirection="column">
            <Text>{markdown}</Text>
          </Box>
        </>
      )}
      {treeLines.length > 0 && (
        <>
          <Text dimColor>{"─".repeat(60)}</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Children:
            </Text>
            {treeLines.map((line, i) => (
              <Text
                key={`${line.id}-${i}`}
                color={i === cursor ? "cyan" : undefined}
                bold={i === cursor}
              >
                {i === cursor ? "❯ " : "  "}
                {line.text}
              </Text>
            ))}
          </Box>
        </>
      )}
      <Box marginTop={1}>
        <Text dimColor>{"─".repeat(60)}</Text>
      </Box>
      {message ? (
        <Text color="green">{message}</Text>
      ) : (
        <Text dimColor>
          e edit{treeLines.length > 0 ? " · ↑↓/jk select · Enter open" : ""} ·
          Esc/q back
        </Text>
      )}
    </Box>
  );
}
