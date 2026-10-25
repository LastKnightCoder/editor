import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { ContentIdentityTable } from "../tables/content-identity";
import { WhiteboardDocumentRepository } from "./repository";

/** 新空白文档直接使用当前模型，不经过旧 JSON 转换与自动迁移。 */
export function createEmptyWhiteboardDocument(
  db: Database.Database,
  title: string,
  pages: readonly { name: string }[],
  owner: "board" | "standalone"
) {
  const doc = new Y.Doc({ gc: false }),
    model = new WhiteboardModel(doc);
  try {
    model.submit(
      [
        { type: "edit_title", edit: { offset: 0, remove: 0, text: title } },
        ...pages.map(page => ({ type: "create_page" as const, title: page.name })),
      ],
      null
    );
    const result = new WhiteboardDocumentRepository(db, "").create(randomUUID(), model, owner);
    return {
      documentId: result.documentId,
      boardId: result.boardId,
      contentIds: (
        db
          .prepare(
            "SELECT content_id FROM whiteboard_document_pages WHERE document_id=? ORDER BY page_index"
          )
          .all(result.documentId) as { content_id: number }[]
      ).map(row => row.content_id),
    };
  } finally {
    model.dispose();
    doc.destroy();
  }
}
export function isEmptyWhiteboardPage(value: {
  data?: {
    version?: unknown;
    documentKind?: unknown;
    children?: unknown;
    presentationSequences?: unknown;
  };
}): boolean {
  return (
    value.data?.documentKind === undefined &&
    [undefined, 1, 2].includes(value.data?.version as number | undefined) &&
    Array.isArray(value.data?.children) &&
    value.data.children.length === 0 &&
    (!Array.isArray(value.data.presentationSequences) ||
      value.data.presentationSequences.length === 0)
  );
}

export function hasWhiteboardLibraryBaseline(db: Database.Database): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='library_identity'").get() &&
    ContentIdentityTable.library(db)
  );
}
