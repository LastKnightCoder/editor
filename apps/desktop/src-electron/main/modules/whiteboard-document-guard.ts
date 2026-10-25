import type Database from "better-sqlite3";
export function isDocumentPage(db: Database.Database, id: number): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='whiteboard_document_pages'").get() &&
    db.prepare("SELECT 1 FROM whiteboard_document_pages WHERE content_id=?").get(id)
  );
}
export function assertLegacyWhiteboardPage(db: Database.Database, id: number): void {
  if (isDocumentPage(db, id))
    throw new Error("WHITEBOARD_DOCUMENT_WRITE_REQUIRED: 此页由文档会话管理，不能覆盖旧快照");
}
export function assertLegacyWhiteboard(db: Database.Database, id: number): void {
  if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='whiteboard_documents'").get() &&
    db.prepare("SELECT 1 FROM whiteboard_documents WHERE board_id=?").get(id)
  )
    throw new Error("WHITEBOARD_DOCUMENT_WRITE_REQUIRED: 请通过文档会话修改白板结构");
}
