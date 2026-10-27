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
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { ContentIdentityTable } from "../tables/content-identity";
import { stateHash } from "./journal";
import { WhiteboardDocumentRepository } from "./repository";
import type { LegacyWhiteboardContext } from "./legacy";

interface Row {
  document_id: string;
  source_id: string;
  baseline_id: string;
  board_id: number | null;
  board_created_at: number | null;
  revision: number;
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
 * 白板打开前自愈主库检查点。修复前原始行备份到 `whiteboard-repairs/`：
 * - 检查点摘要不符、字节读不出：按主库快照投影重建状态（快照与状态由同一事务写入）；
 * - 来源基线与当前资料库身份不一致（如整库替换、旧库合入）：改记为当前基线；
 * - 拥有者白板的创建时间与记录不一致：按当前拥有者行回写。
 * 代次与修订不变（页投影里记着代次）；与新基线对不上的本机日志由会话恢复时备份丢弃。
 * 快照也读不出时保持原错误，不伪造内容。返回是否改写。
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
  const library = ContentIdentityTable.library(db);
  if (!library) return false;
  const baselineMoved =
    library.sourceId !== row.source_id || library.baselineId !== row.baseline_id;
  const board =
    row.board_id === null
      ? null
      : ((db.prepare("SELECT create_time FROM white_boards WHERE id=?").get(row.board_id) as
          | { create_time: number }
          | undefined) ?? null);
  const ownerMoved = row.board_id !== null && board && board.create_time !== row.board_created_at;
  const stateBroken = stateHash(row.state) !== row.revision_hash || !(await readable(row.state));
  if (!baselineMoved && !ownerMoved && !stateBroken) return false;
  const state = stateBroken ? await rebuildFromSnapshot(row) : new Uint8Array(row.state);
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(backupDirectory, `${Date.now()}-${documentId.slice(0, 36)}.json`),
    JSON.stringify({ ...row, state: row.state.toString("base64") }),
    { mode: 0o600 }
  );
  const hash = stateHash(state);
  db.transaction(() => {
    const current = db
      .prepare("SELECT revision_hash FROM whiteboard_documents WHERE document_id=?")
      .get(documentId) as { revision_hash: string } | undefined;
    if (current?.revision_hash !== row.revision_hash)
      throw new Error("白板在修复期间已变化，请重试");
    db.prepare(
      `UPDATE whiteboard_documents SET source_id=?,baseline_id=?,board_created_at=?,
        revision_hash=?,state=?,update_time=? WHERE document_id=?`
    ).run(
      library.sourceId,
      library.baselineId,
      ownerMoved ? board!.create_time : row.board_created_at,
      hash,
      Buffer.from(state),
      Date.now(),
      documentId
    );
  })();
  console.warn(`[whiteboard-repair] 白板 ${documentId} 已自愈，原记录备份在 ${backupDirectory}`);
  return true;
}

/**
 * 旧 JSON 白板页（尚无文档记录）打开前转换为当前文档：所属白板的全部页一并转换，
 * 原页行原样备份到 `whiteboard-repairs/`，未知元素以恢复元素原样保留。
 * 内嵌正文经 `repairBody`（内容转换窗口的正文修复）补齐。返回是否转换。
 */
export async function upgradeLegacyWhiteboardPage(
  db: Database.Database,
  databaseName: string,
  contentId: number,
  backupDirectory: string,
  context: {
    editorContracts: ContentContractDictionary;
    repairBody: LegacyWhiteboardContext["repairBody"];
    mapResource?: (documentId: string, reference: string) => Promise<string>;
    current: () => boolean;
  }
): Promise<boolean> {
  if (db.prepare("SELECT 1 FROM whiteboard_document_pages WHERE content_id=?").get(contentId))
    return false;
  const page = db
    .prepare("SELECT id,create_time,name,data FROM white_board_contents WHERE id=?")
    .get(contentId) as { id: number; create_time: number; name: string; data: string } | undefined;
  if (!page) return false;
  const parsed = (() => {
    try {
      return JSON.parse(page.data);
    } catch {
      return null;
    }
  })();
  // 只处理旧页：数据里已标记为文档页、却缺映射的不在此处猜测
  if (!parsed || typeof parsed !== "object" || parsed.documentKind !== undefined) return false;
  ContentIdentityTable.establishBaseline(db);
  const board = (
    db.prepare("SELECT id,create_time,title,white_board_content_ids FROM white_boards").all() as {
      id: number;
      create_time: number;
      title: string;
      white_board_content_ids: string;
    }[]
  ).find(row => {
    try {
      return (JSON.parse(row.white_board_content_ids) as unknown[]).includes(contentId);
    } catch {
      return false;
    }
  });
  if (board && db.prepare("SELECT 1 FROM whiteboard_documents WHERE board_id=?").get(board.id))
    return false;
  const contentIds: number[] = board ? JSON.parse(board.white_board_content_ids) : [contentId];
  const pages = contentIds.map(id => {
    const row = db
      .prepare("SELECT id,create_time,name,data FROM white_board_contents WHERE id=?")
      .get(id) as typeof page | undefined;
    if (!row) throw new Error("旧白板页缺失");
    return row;
  });
  const owner = ContentIdentityTable.reference(
    db,
    board ? "whiteboard" : "whiteboard-content",
    board?.id ?? contentId
  );
  const target = {
    documentId: owner.entityId,
    epoch: 0,
    boardId: board?.id ?? null,
    boardTitle: board?.title ?? "",
    pages: pages.map(row => ({
      pageId: ContentIdentityTable.reference(db, "whiteboard-content", row.id).entityId,
      contentId: row.id,
      createdAt: row.create_time,
      title: row.name ?? "",
      data: row.data,
    })),
  };
  const { convertLegacyWhiteboard } = await import("./legacy");
  const converted = await convertLegacyWhiteboard(
    target.pages.map(entry => ({
      id: entry.pageId,
      title: entry.title,
      data: (() => {
        try {
          const value = JSON.parse(entry.data);
          return value && Array.isArray(value.children) ? value : { children: [] };
        } catch {
          return { children: [] };
        }
      })(),
    })),
    {
      documentId: target.documentId,
      title: board?.title ?? page.name ?? "",
      editorContracts: context.editorContracts,
      resolveEntity: (kind, id) => {
        try {
          return ContentIdentityTable.reference(db, kind, id);
        } catch {
          return null;
        }
      },
      mapResource: reference =>
        context.mapResource?.(target.documentId, reference) ?? Promise.resolve(reference),
      repairBody: context.repairBody,
    }
  );
  const model = new WhiteboardModel(converted.doc);
  try {
    if (!context.current() || !db.open) throw new Error("资料库已切换，请重新打开白板");
    mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(backupDirectory, `${Date.now()}-legacy-${target.documentId.slice(0, 36)}.json`),
      JSON.stringify({ board, pages, issues: converted.issues }),
      { mode: 0o600 }
    );
    new WhiteboardDocumentRepository(db, databaseName).installBaseline(model, null, target);
  } finally {
    model.dispose();
    converted.doc.destroy();
  }
  console.warn(
    `[whiteboard-repair] 旧白板 ${target.documentId} 已转换，原页面备份在 ${backupDirectory}`
  );
  return true;
}
