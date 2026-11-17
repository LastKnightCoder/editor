import type Database from "better-sqlite3";
import isEqual from "lodash/isEqual";
import type { CollaborationSession, ContentNode, SourceBinding } from "@tau/collaboration";
import { isSupportedContentStorageVersion } from "@tau/db-schema";
import { findCollaborationBinding } from "../collaboration-guard";
import { bindingMatches } from "../collaboration/content-repository";
import { ContentDocumentTable } from "../tables/content-document";
import { ContentDocumentBlocks } from "../tables/content-document-blocks";
import { ContentIdentityTable } from "../tables/content-identity";
import type {
  ContentProjectionHead,
  ContentProjectionStore,
  ContentProjectionWrite,
} from "./content-projection";

// 节点投影会补默认文本类型并重排对象键，这些差异不属于正文编辑。
function contentProjectionsEqual(previous: ContentNode[], next: ContentNode[]): boolean {
  if (previous === next) return true;
  return (
    previous.length === next.length &&
    previous.every((node, index) => {
      const candidate = next[index];
      if (node === candidate) return true;
      const text = !node.children && !candidate.children;
      if (text && (node.type ?? "formatted") !== (candidate.type ?? "formatted")) return false;
      const keys = Object.keys(node).filter(key => !text || key !== "type");
      const nextKeys = Object.keys(candidate).filter(key => !text || key !== "type");
      return (
        keys.length === nextKeys.length &&
        keys.every(key => {
          if (!Object.hasOwn(candidate, key)) return false;
          if (key === "children" && node.children && candidate.children)
            return contentProjectionsEqual(node.children, candidate.children);
          return isEqual(node[key], candidate[key]);
        })
      );
    })
  );
}

export class SqliteContentProjection implements ContentProjectionStore {
  constructor(
    private readonly db: Database.Database,
    private readonly source: SourceBinding,
    private readonly owner: Pick<CollaborationSession, "id" | "mode" | "serverUrl">
  ) {}

  readHead(): ContentProjectionHead {
    const { db, source, owner } = this;
    const row = db
      .prepare(`
      SELECT c.create_time,d.document_id,d.format_version,d.revision
      FROM content_snapshots c LEFT JOIN content_documents d ON d.content_id=c.id WHERE c.id=?
    `)
      .get(source.contentId) as
      | {
          create_time: number;
          document_id: string | null;
          format_version: number | null;
          revision: string | null;
        }
      | undefined;
    if (!row || row.create_time !== source.contentCreatedAt) throw new Error("原内容关联已变化");
    if (
      owner.mode === "local"
        ? Boolean(findCollaborationBinding(db, source.contentId))
        : !bindingMatches(db, source, owner.id, owner.serverUrl)
    )
      throw new Error("正文会话绑定已变化，停止回写");
    if (row.format_version !== null && !isSupportedContentStorageVersion(row.format_version))
      throw new Error("正文数据格式不兼容");
    if (!row.document_id || !row.revision)
      throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
    if (
      (source.librarySourceId &&
        source.librarySourceId !== ContentIdentityTable.library(db)?.sourceId) ||
      (source.contentDocumentId && source.contentDocumentId !== row.document_id)
    )
      throw new Error("资料库或正文身份已变化，已暂停原会话写入");
    return {
      documentId: row.document_id,
      revision: row.revision,
      formatVersion: row.format_version,
    };
  }

  commit(write: ContentProjectionWrite): { changed: boolean; writtenBlocks: number } {
    const { db, source } = this;
    return db.transaction(() => {
      const head = this.readHead();
      const { changed, writtenBlocks } =
        write.kind === "blocks"
          ? ContentDocumentBlocks.commit(db, source.contentId, write)
          : { changed: this.commitSnapshot(write, head.documentId), writtenBlocks: 0 };
      if (changed)
        db.prepare(
          "INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES (?,?,'content','update')"
        ).run(Date.now(), source.contentId);
      return { changed, writtenBlocks };
    })();
  }

  private commitSnapshot(
    write: Extract<ContentProjectionWrite, { kind: "snapshot" }>,
    documentId: string
  ): boolean {
    const { db, source } = this;
    if (documentId !== write.documentId) throw new Error("正文身份已变化，请重新打开当前正文");
    const previous = ContentDocumentTable.read(db, source.contentId);
    if (!previous) throw new Error("正文记录不存在，无法投影");
    const contentChanged =
      write.changes?.content ?? !contentProjectionsEqual(previous.content, write.content);
    const contractsChanged =
      write.changes?.contracts ?? !isEqual(previous.contracts, write.contracts);
    // 回执重试可能拿到提交前的修订，同一内容无需再写。
    if (!contentChanged && !contractsChanged) return false;
    if (previous.revision !== write.expectedRevision)
      throw new Error("正文投影修订冲突，已保留原缓存并暂停写入");
    ContentDocumentTable.commit(
      db,
      source.contentId,
      {
        documentId,
        contracts: write.contracts,
        content: contentChanged ? write.content : previous.content,
      },
      {
        expectedRevision: write.expectedRevision,
        count: write.count,
        preserveUpdateTime: !contentChanged,
      }
    );
    return contentChanged;
  }
}
