import type Database from "better-sqlite3";
import { isSupportedContentStorageVersion } from "@tau/db-schema";
import { findCollaborationBinding } from "../collaboration-guard";
import { repairContentForOpen } from "../content-repair";
import { ContentDocumentTable } from "../tables/content-document";
import { ContentIdentityTable } from "../tables/content-identity";

/** 打开时使用固定连接的读写入口。正文头可以独立于整篇快照读取。 */
export class LocalContentSource {
  constructor(
    private readonly db: Database.Database,
    private readonly name: string,
    private readonly contentId: number
  ) {}

  shared() {
    return Boolean(findCollaborationBinding(this.db, this.contentId));
  }

  repair(check: () => void) {
    return repairContentForOpen(this.db, this.name, this.contentId, () => {
      check();
      return true;
    });
  }

  head() {
    const row = this.db
      .prepare(
        `SELECT c.create_time AS createdAt,d.document_id AS documentId,d.format_version AS format,
                d.revision FROM contents c LEFT JOIN content_documents d ON c.id=d.content_id WHERE c.id=?`
      )
      .get(this.contentId) as
      | {
          createdAt: number;
          documentId: string | null;
          format: number | null;
          revision: string | null;
        }
      | undefined;
    if (!row) return;
    if (row.format !== null && !isSupportedContentStorageVersion(row.format))
      throw new Error("正文数据格式不兼容");
    return { ...row, librarySourceId: ContentIdentityTable.library(this.db)?.sourceId };
  }

  snapshot() {
    return ContentDocumentTable.read(this.db, this.contentId);
  }
}
