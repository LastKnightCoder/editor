import type Database from "better-sqlite3";

export interface StoredCollaborationBinding {
  content_id: number;
  content_created_at: number;
  server_url: string;
  document_id: string;
  source_type?: string;
  source_id?: number;
  source_title?: string;
}

export function findCollaborationBinding(
  db: Database.Database,
  contentId: number
): StoredCollaborationBinding | undefined {
  if (
    !db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='collaboration_bindings'")
      .get()
  )
    return undefined;
  return db.prepare("SELECT * FROM collaboration_bindings WHERE content_id=?").get(contentId) as
    | StoredCollaborationBinding
    | undefined;
}

export function assertContentIsLocal(db: Database.Database, contentId: number) {
  if (findCollaborationBinding(db, contentId))
    throw new Error(
      "COLLABORATION_WRITE_REQUIRED: 这段内容正在协作，请通过协作编辑器修改，或先结束共享"
    );
}
