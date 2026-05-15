import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { SlateRenderer } from "../../../ui/slate-renderer/index.js";
import {
  parseSlateContent,
  type ParseResult,
} from "../../../ui/slate-renderer/parse.js";
import { runDocumentEdit } from "../../document/edit.js";
import { formatDate } from "../../../utils/text.js";
import { buildTreeLines, TreeNode } from "../../../utils/tree.js";

interface DocumentRow {
  id: number;
  create_time: number;
  update_time: number;
  title: string;
  children: string;
  content: string | null;
  is_top: number;
}

interface DocumentItemRow {
  id: number;
  title: string;
  children: string;
  ref_type: string;
}

export function DocumentDetailView({
  docId,
  onBack,
  onShowDocumentItem,
}: {
  docId: number;
  onBack: () => void;
  onShowDocumentItem?: (itemId: number) => void;
}) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [contentResult, setContentResult] = useState<ParseResult>({
    status: "empty",
  });
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

      const row = da.queryOne<DocumentRow>(
        `SELECT id, create_time, update_time, title, children, content, is_top
         FROM documents WHERE id = ?`,
        docId,
      );

      if (!row) {
        setError(`Document #${docId} not found.`);
        return;
      }

      setDoc(row);
      setContentResult(parseSlateContent(row.content));

      let rootIds: number[] = [];
      try {
        rootIds = JSON.parse(row.children) as number[];
      } catch {
        /* ignore parse error */
      }

      const items = da.query<DocumentItemRow>(
        `SELECT id, title, children, ref_type FROM document_items
         WHERE EXISTS (SELECT 1 FROM json_each(documents) WHERE value = ?)`,
        docId,
      );

      const nodeMap = new Map<number, TreeNode>();
      for (const item of items) {
        let children: number[] = [];
        try {
          children = JSON.parse(item.children) as number[];
        } catch {
          /* ignore parse error */
        }
        nodeMap.set(item.id, {
          id: item.id,
          title: item.title,
          type: item.ref_type || undefined,
          children,
        });
      }

      setTreeLines(buildTreeLines(rootIds, nodeMap));
    } catch (e: any) {
      setError(e.message);
    }
  }, [docId]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }
    if (input === "e") {
      setMessage("Opening in editor...");
      runDocumentEdit(docId).catch(() => {
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
      } else if (key.return && onShowDocumentItem) {
        const selected = treeLines[cursor];
        if (selected) {
          onShowDocumentItem(selected.id);
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

  if (!doc) {
    return <Text dimColor>Loading...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Document #{doc.id}: {doc.title}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(60)}</Text>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Box width={12}>
            <Text dimColor>Pinned</Text>
          </Box>
          <Text>{doc.is_top ? "Yes" : "No"}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Items</Text>
          </Box>
          <Text>{treeLines.length}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatDate(doc.create_time)}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatDate(doc.update_time)}</Text>
        </Box>
      </Box>
      {contentResult.status !== "empty" && (
        <>
          <Text dimColor>{"─".repeat(60)}</Text>
          <Box marginTop={1} marginBottom={1} flexDirection="column">
            {contentResult.status === "ok" ? (
              <SlateRenderer nodes={contentResult.nodes} />
            ) : (
              <Text color="red">({contentResult.message})</Text>
            )}
          </Box>
        </>
      )}
      <Text dimColor>{"─".repeat(60)}</Text>
      {treeLines.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Items:
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
      ) : (
        <Box marginTop={1}>
          <Text dimColor>(no items)</Text>
        </Box>
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
