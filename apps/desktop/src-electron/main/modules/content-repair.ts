import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ContentNode } from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { getContentLength } from "@/utils/helper.ts";
import PathUtil from "../utils/PathUtil";
import { contentExecutor } from "../services/content-execution";
import { ContentDocumentTable } from "./tables/content-document";
import { ContentIdentityTable } from "./tables/content-identity";
import Operation from "./tables/operation";
import { emitContentWritten } from "./content-events";

interface RawContent {
  content: string;
  document?: { document_id: string; format_version: number; contracts: string; revision: string };
}

const readRaw = (db: Database.Database, contentId: number): RawContent | null => {
  const row = db.prepare("SELECT content FROM contents WHERE id=?").get(contentId) as
    | { content: string }
    | undefined;
  if (!row) return null;
  const document = db
    .prepare(
      "SELECT document_id,format_version,contracts,revision FROM content_documents WHERE content_id=?"
    )
    .get(contentId) as RawContent["document"];
  return { content: row.content, document };
};

const parse = (value: string | undefined): unknown => {
  try {
    return value === undefined ? undefined : JSON.parse(value);
  } catch {
    return undefined;
  }
};

/**
 * 打开前自愈：正文缺身份、缺契约、契约不匹配或尚无文档记录（旧格式）时，
 * 先把原始字节备份到 `content-repairs/`，再按当前节点声明补齐并写回主库；合格正文不动。
 * 返回是否改写了正文。字典版本不是协议 2 的记录不在此修复范围，保持原报错。
 */
export async function repairContentForOpen(
  db: Database.Database,
  name: string,
  contentId: number,
  current: () => boolean
): Promise<boolean> {
  const raw = readRaw(db, contentId);
  if (!raw || (raw.document && raw.document.format_version !== 2)) return false;
  const content = parse(raw.content);
  const contracts = parse(raw.document?.contracts) as ContentContractDictionary | undefined;
  if (raw.document && ContentDocumentTable.problem(content, contracts) === null) return false;
  const repaired = await contentExecutor.execute<{
    content: ContentNode[];
    contracts: ContentContractDictionary;
  }>({ operation: "repair-content", content, contracts: contracts ?? {} });
  if (!current() || !db.open) throw new Error("资料库已切换，请重新打开内容");
  const latest = readRaw(db, contentId);
  if (
    !latest ||
    latest.content !== raw.content ||
    latest.document?.revision !== raw.document?.revision
  )
    throw new Error("正文在修复期间已变化，请重试");
  const directory = join(PathUtil.getAppDir(), "content-repairs");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(directory, `${Date.now()}-${basename(db.name, ".db")}-${contentId}.json`),
    JSON.stringify({ database: name, contentId, ...raw }),
    { mode: 0o600 }
  );
  db.transaction(() => {
    if (!raw.document) ContentIdentityTable.establishBaseline(db);
    ContentDocumentTable.commit(
      db,
      contentId,
      {
        documentId: raw.document?.document_id ?? randomUUID(),
        content: repaired.content,
        contracts: repaired.contracts,
      },
      {
        installDocument: true,
        expectedRevision: raw.document?.revision,
        count: getContentLength(repaired.content as never),
      }
    );
    Operation.insertOperation(db, "content", "update", contentId, Date.now());
  })();
  emitContentWritten(db, contentId, "update");
  console.warn(`[content-repair] 正文 ${contentId} 已自愈，原文备份在 content-repairs/`);
  return true;
}
