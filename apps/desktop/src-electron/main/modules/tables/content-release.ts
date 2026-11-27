import type Database from "better-sqlite3";

export function releaseContentDeferred(db: Database.Database, contentId: number): void {
  db.prepare("UPDATE contents SET ref_count = ref_count - 1 WHERE id = ? AND ref_count > 0").run(
    contentId
  );
  const row = db.prepare("SELECT ref_count FROM content_snapshots WHERE id = ?").get(contentId) as
    | { ref_count: number }
    | undefined;
  if (!row || row.ref_count > 0) return;
  db.prepare(
    "INSERT OR IGNORE INTO content_pending_releases (content_id, released_at) VALUES (?, ?)"
  ).run(contentId, Date.now());
}
