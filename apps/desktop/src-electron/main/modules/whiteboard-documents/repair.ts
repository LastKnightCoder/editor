import type Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import {
  WhiteboardModel,
  createWhiteboardBaseline,
  whiteboardTransferResources,
  type WhiteboardSnapshot,
  type WhiteboardElementSnapshot,
  type TransferElement,
} from "@tau/collaboration";
import { stateHash } from "./journal";

interface Row {
  document_id: string;
  revision_hash: string;
  state: Buffer;
  contracts: string;
  snapshot: string;
}

const strip = (nodes: readonly WhiteboardElementSnapshot[]): TransferElement[] =>
  nodes.map(({ fieldBindings: _fields, recoveryReason: _recovery, children, ...value }) => ({
    ...value,
    children: strip(children),
  }));

/** 主库快照投影重建为 Yjs 状态：元素身份、契约与正文按快照保留，演示序列一并恢复 */
async function rebuildFromSnapshot(row: Row): Promise<Uint8Array> {
  const snapshot = JSON.parse(row.snapshot) as WhiteboardSnapshot;
  const pages = snapshot.pages.map(page => ({
    id: page.id,
    title: page.title,
    ...(page.sketch ? { sketch: page.sketch } : {}),
    // 恢复区元素也放回所在页，不让快照里有而重建后丢失
    elements: strip([...page.children, ...page.recovery]),
  }));
  const bundle = {
    format: "whiteboard-transfer-v1" as const,
    sourceDocumentId: row.document_id,
    title: snapshot.title,
    pages,
    contracts: JSON.parse(row.contracts),
    resources: [] as string[],
    presentations: [...(snapshot.presentations ?? [])],
  };
  bundle.resources = whiteboardTransferResources(bundle);
  const doc = await createWhiteboardBaseline(bundle);
  try {
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

async function readable(state: Buffer): Promise<boolean> {
  const doc = new Y.Doc({ gc: false }),
    model = new WhiteboardModel(doc);
  try {
    return (await model.receive(new Uint8Array(state))).status === "applied";
  } catch {
    return false;
  } finally {
    model.dispose();
    doc.destroy();
  }
}

/**
 * 白板打开前自愈主库检查点：检查点摘要不符或字节读不出时，按主库快照投影重建状态
 * （快照与状态由同一事务写入），原始行先备份到 `repairs/`。来源基线与拥有者错位不在此处理，
 * 保持原错误：那表示身份出了问题，改写会掩盖它。快照也读不出时保持原错误，不伪造内容。
 * 返回是否改写。
 */
export async function repairWhiteboardDocument(
  db: Database.Database,
  documentId: string,
  backupDirectory: string
): Promise<boolean> {
  const row = db
    .prepare("SELECT * FROM whiteboard_documents WHERE document_id=?")
    .get(documentId) as Row | undefined;
  if (!row) return false;
  if (stateHash(row.state) === row.revision_hash && (await readable(row.state))) return false;
  const state = await rebuildFromSnapshot(row);
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(backupDirectory, `${Date.now()}-${documentId.slice(0, 36)}.json`),
    JSON.stringify({ ...row, state: row.state.toString("base64") }),
    { mode: 0o600 }
  );
  db.transaction(() => {
    const current = db
      .prepare("SELECT revision_hash FROM whiteboard_documents WHERE document_id=?")
      .get(documentId) as { revision_hash: string } | undefined;
    if (current?.revision_hash !== row.revision_hash)
      throw new Error("白板在修复期间已变化，请重试");
    db.prepare(
      "UPDATE whiteboard_documents SET revision_hash=?,state=?,update_time=? WHERE document_id=?"
    ).run(stateHash(state), Buffer.from(state), Date.now(), documentId);
  })();
  console.warn(`[whiteboard-repair] 白板 ${documentId} 已自愈，原记录备份在 ${backupDirectory}`);
  return true;
}
