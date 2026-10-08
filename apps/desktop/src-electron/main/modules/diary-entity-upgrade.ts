import type Database from "better-sqlite3";

const isDayKind = (kind: unknown) => kind === "diary" || kind === "diary-daily";

/** 存量链接优先按实际正文定位；缺正文 id 的旧链接沿用原先首段关联的语义。 */
export function diaryLinkPatcher(db: Database.Database) {
  const byContent = db.prepare(
    "SELECT id FROM diary_segments WHERE content_id = ? AND diary_id = ?"
  );
  const first = db.prepare(
    "SELECT id, content_id FROM diary_segments WHERE diary_id = ? ORDER BY create_time, id LIMIT 1"
  );
  return (node: Record<string, unknown>): Record<string, unknown> | null => {
    if (node.type !== "content-link" || !isDayKind(node.contentType)) return null;
    if (typeof node.refId !== "number") return null;
    const segment = (
      typeof node.contentId === "number"
        ? byContent.get(node.contentId, node.refId)
        : first.get(node.refId)
    ) as { id: number; content_id?: number } | undefined;
    if (!segment) return null;
    return {
      contentType: "diary-moment",
      refId: segment.id,
      ...(segment.content_id != null ? { contentId: segment.content_id } : {}),
    };
  };
}

/** 开库转换存量日级引用，保留正文、引用计数及用户编辑时间；全部设备升级后删除。 */
export function upgradeDiaryEntityReferences(db: Database.Database): number {
  const patchLink = diaryLinkPatcher(db);
  const segmentById = db.prepare("SELECT id FROM diary_segments WHERE id = ? AND diary_id = ?");
  let changed = 0;
  const transform = (value: unknown): boolean => {
    if (Array.isArray(value))
      return value.reduce((result, item) => transform(item) || result, false);
    if (!value || typeof value !== "object") return false;
    const node = value as Record<string, unknown>;
    let patched = false;
    const link = patchLink(node);
    if (link) {
      Object.assign(node, link);
      patched = true;
    }
    const ref = node.entityRef as { kind?: unknown; id?: unknown } | undefined;
    if (
      node.type === "document" &&
      ref?.kind === "diary" &&
      typeof ref.id === "number" &&
      typeof node.segmentId === "number"
    ) {
      const segment = segmentById.get(node.segmentId, ref.id) as { id: number } | undefined;
      if (segment) {
        node.entityRef = { kind: "diary-moment", id: segment.id };
        delete node.segmentId;
        patched = true;
      }
    }
    for (const child of Object.values(node)) patched = transform(child) || patched;
    return patched;
  };
  db.transaction(() => {
    for (const [table, column] of [
      ["contents", "content"],
      ["white_board_contents", "data"],
    ] as const) {
      const rows = db
        .prepare(`SELECT id, ${column} AS json FROM ${table} WHERE ${column} LIKE '%diary%'`)
        .all() as Array<{ id: number; json: string }>;
      const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
      for (const row of rows) {
        const value: unknown = JSON.parse(row.json);
        if (!transform(value)) continue;
        update.run(JSON.stringify(value), row.id);
        changed++;
      }
    }
    for (const [table, column] of [
      ["todo_note_link", "type"],
      ["flashcard_references", "ref_type"],
    ] as const) {
      changed += db
        .prepare(
          `UPDATE ${table} SET ${column} = 'diary-moment'
         WHERE ${column} IN ('diary', 'diary-daily')
           AND EXISTS (SELECT 1 FROM diary_segments s WHERE s.content_id = ${table}.content_id)`
        )
        .run().changes;
    }
    const notes = db
      .prepare(
        "SELECT id, source_meta_info FROM vibe_learning_resources WHERE source_type = 'note' AND source_meta_info LIKE '%diary%'"
      )
      .all() as Array<{ id: number; source_meta_info: string }>;
    const byContent = db.prepare("SELECT id FROM diary_segments WHERE content_id = ?");
    for (const row of notes) {
      const meta = JSON.parse(row.source_meta_info) as Record<string, unknown>;
      if (!isDayKind(meta.type) || typeof meta.contentId !== "number") continue;
      const moment = byContent.get(meta.contentId) as { id: number } | undefined;
      if (!moment) continue;
      db.prepare("UPDATE vibe_learning_resources SET source_meta_info = ? WHERE id = ?").run(
        JSON.stringify({ ...meta, type: "diary-moment", originalId: moment.id }),
        row.id
      );
      changed++;
    }
    const lineage = db
      .prepare(
        "SELECT * FROM entity_lineage WHERE src_kind IN ('diary', 'diary-daily') OR dst_kind IN ('diary', 'diary-daily')"
      )
      .all() as Array<{
      id: number;
      src_kind: string;
      src_id: string;
      src_anchor: string | null;
      dst_kind: string;
      dst_id: string;
      relation: string;
      create_time: number;
    }>;
    const moments = db.prepare("SELECT id FROM diary_segments WHERE diary_id = ? ORDER BY id");
    const endpoints = (kind: string, id: string) =>
      isDayKind(kind)
        ? (moments.all(id) as Array<{ id: number }>).map(moment => ({
            kind: "diary-moment",
            id: String(moment.id),
          }))
        : [{ kind, id }];
    const insert = db.prepare(
      "INSERT OR IGNORE INTO entity_lineage (src_kind, src_id, src_anchor, dst_kind, dst_id, relation, create_time) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const row of lineage) {
      const sources = endpoints(row.src_kind, row.src_id);
      const targets = endpoints(row.dst_kind, row.dst_id);
      if (!sources.length || !targets.length) continue;
      for (const src of sources)
        for (const dst of targets)
          insert.run(
            src.kind,
            src.id,
            row.src_anchor,
            dst.kind,
            dst.id,
            row.relation,
            row.create_time
          );
      db.prepare("DELETE FROM entity_lineage WHERE id = ?").run(row.id);
      changed++;
    }
  })();
  return changed;
}
