import React from "react";
import { render, Box, Text } from "ink";
import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import { SlateRenderer } from "../../ui/slate-renderer/index.js";
import { parseSlateContent } from "../../ui/slate-renderer/parse.js";
import { Header, Divider } from "../../ui/components.js";
import { formatDate } from "../../utils/text.js";
import { buildTreeLines, TreeNode } from "../../utils/tree.js";

interface DocumentRow {
  id: number;
  create_time: number;
  update_time: number;
  title: string;
  desc: string | null;
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

function DocumentShowView({
  doc,
  nodes,
  treeLines,
}: {
  doc: DocumentRow;
  nodes: any[] | null;
  treeLines: { text: string; id: number }[];
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Header>
        Document #{doc.id}: {doc.title}
      </Header>
      <Divider width={60} />
      <Box flexDirection="column" gap={0} marginBottom={1}>
        <Box>
          <Box width={14}>
            <Text dimColor>Pinned</Text>
          </Box>
          <Text>{doc.is_top ? "Yes" : "No"}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Items</Text>
          </Box>
          <Text>{treeLines.length}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Created</Text>
          </Box>
          <Text dimColor>{formatDate(doc.create_time)}</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text dimColor>Updated</Text>
          </Box>
          <Text dimColor>{formatDate(doc.update_time)}</Text>
        </Box>
      </Box>
      {nodes && (
        <>
          <Divider width={60} />
          <Box marginTop={1} marginBottom={1}>
            <SlateRenderer nodes={nodes} />
          </Box>
        </>
      )}
      <Divider width={60} />
      {treeLines.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Items:
          </Text>
          {treeLines.map((line) => (
            <Text key={line.id}>{line.text}</Text>
          ))}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>(no items)</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runDocumentShow(docId: number) {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  const doc = da.queryOne<DocumentRow>(
    `SELECT id, create_time, update_time, title, desc, children, content, is_top
     FROM documents WHERE id = ?`,
    docId,
  );

  if (!doc) {
    closeDataAccess();
    render(
      <Box paddingX={1}>
        <Text color="red">Document #{docId} not found.</Text>
      </Box>,
    );
    return;
  }

  let rootIds: number[] = [];
  try {
    rootIds = JSON.parse(doc.children) as number[];
  } catch {
    /* ignore parse error */
  }

  const items = da.query<DocumentItemRow>(
    `SELECT id, title, children, ref_type FROM document_items
     WHERE EXISTS (SELECT 1 FROM json_each(documents) WHERE value = ?)`,
    docId,
  );

  closeDataAccess();

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

  const treeLines = buildTreeLines(rootIds, nodeMap);

  const result = parseSlateContent(doc.content);
  const nodes = result.status === "ok" ? result.nodes : null;

  if (result.status === "invalid") {
    render(
      <Box paddingX={1} flexDirection="column">
        <Header>
          Document #{doc.id}: {doc.title}
        </Header>
        <Text color="red">({result.message})</Text>
      </Box>,
    );
    return;
  }

  render(<DocumentShowView doc={doc} nodes={nodes} treeLines={treeLines} />);
}
