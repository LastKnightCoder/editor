import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { getDataAccess, closeDataAccess } from "../../../data-access/index.js";
import { getActiveDbName } from "../../../utils/path.js";
import { runDocumentEdit } from "../../document/edit.js";
import {
  formatRelativeTime,
  truncateToWidth,
  padEnd,
} from "../../../utils/text.js";

interface DocumentRow {
  id: number;
  create_time: number;
  update_time: number;
  title: string;
  children: string;
  is_top: number;
}

const PAGE_SIZE = 15;

function queryDocuments(searchTerm: string, topOnly: boolean): DocumentRow[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  let sql = `SELECT id, create_time, update_time, title, children, is_top FROM documents`;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (topOnly) {
    conditions.push("is_top = 1");
  }

  if (searchTerm) {
    conditions.push("title LIKE ?");
    params.push(`%${searchTerm}%`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY is_top DESC, update_time DESC LIMIT 200";

  return da.query<DocumentRow>(sql, ...params);
}

export function DocumentListView({
  onBack,
  onShowDocument,
}: {
  onBack: () => void;
  onShowDocument: (docId: number) => void;
}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [topOnly, setTopOnly] = useState(false);
  const [message, setMessage] = useState("");

  const loadDocuments = useCallback(() => {
    try {
      const result = queryDocuments(searchTerm, topOnly);
      setDocuments(result);
      setCursor(0);
      setPage(0);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }, [searchTerm, topOnly]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const totalPages = Math.max(1, Math.ceil(documents.length / PAGE_SIZE));
  const pageDocuments = documents.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape || key.return) {
        setSearchMode(false);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchTerm((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl) {
        setSearchTerm((s) => s + input);
      }
      return;
    }

    if (key.escape || input === "q") {
      closeDataAccess();
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : pageDocuments.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < pageDocuments.length - 1 ? c + 1 : 0));
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
      setSearchMode(true);
    } else if (input === "f") {
      setTopOnly((v) => !v);
    } else if (key.return) {
      const doc = pageDocuments[cursor];
      if (doc) {
        closeDataAccess();
        onShowDocument(doc.id);
      }
    } else if (input === "e") {
      const doc = pageDocuments[cursor];
      if (doc) {
        setMessage(`Opening document #${doc.id}...`);
        runDocumentEdit(doc.id).catch(() => {
          setMessage("Failed to open editor");
          setTimeout(() => setMessage(""), 2000);
        });
      }
    } else if (input === "r") {
      loadDocuments();
      setMessage("Refreshed");
      setTimeout(() => setMessage(""), 1500);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Document List
        </Text>
        <Text dimColor> ({documents.length} documents)</Text>
        {searchTerm && <Text dimColor> [Search: {searchTerm}]</Text>}
        {topOnly && <Text dimColor> [Pinned only]</Text>}
        <Text dimColor>
          {" "}
          Page {page + 1}/{totalPages}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(80)}</Text>

      {searchMode ? (
        <Box>
          <Text color="yellow">Search title: </Text>
          <Text>{searchTerm}</Text>
          <Text dimColor>█</Text>
        </Box>
      ) : null}

      {pageDocuments.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>No documents found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {pageDocuments.map((doc, i) => {
            const isSelected = i === cursor;
            const title = truncateToWidth(doc.title || "(untitled)", 44);
            const childCount = (() => {
              try {
                return JSON.parse(doc.children).length;
              } catch {
                return 0;
              }
            })();
            const time = formatRelativeTime(doc.update_time);

            return (
              <Box key={doc.id}>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {isSelected ? "❯" : " "} {padEnd(`#${doc.id}`, 6)}
                </Text>
                <Text color={isSelected ? "white" : undefined}>
                  {padEnd(title, 45)}
                </Text>
                <Text dimColor>{padEnd(`${childCount}项`, 6)}</Text>
                {doc.is_top ? (
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
          ↑↓/jk navigate · Enter view · e edit · / search · f toggle pinned ·
          n/p page · r refresh · Esc back
        </Text>
      )}
    </Box>
  );
}
