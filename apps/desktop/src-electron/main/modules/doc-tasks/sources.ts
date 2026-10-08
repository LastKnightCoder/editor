import type Database from "better-sqlite3";
import { ENTITY_REF_PRIORITY, type EntityRefKind } from "@/entity/ref";
import { normalizeDiaryDay } from "@/utils/diary-day";

interface SourceRow {
  content_id: number;
  kind: EntityRefKind;
  id: number;
  title: string | null;
  meta: string;
  update_time: number;
  moment_id: number | null;
  created_at: number;
}

/** 来源轻表：按批取标题与定位，不加载正文快照或无用摘要。 */
export function resolveDocTaskSources(
  db: Database.Database,
  contentIds: number[]
): Map<number, SourceRow> {
  const result = new Map<number, SourceRow>();
  const ids = [...new Set(contentIds)];
  for (let start = 0; start < ids.length; start += 150) {
    const batch = ids.slice(start, start + 150);
    const marks = batch.map(() => "?").join(",");
    const rows = db
      .prepare(
        `
      WITH diary_counts AS (
        SELECT diary_id, COUNT(*) AS n FROM diary_segments
        WHERE diary_id IN (SELECT diary_id FROM diary_segments WHERE content_id IN (${marks})) GROUP BY diary_id
      )
      SELECT c.content_id, 'card' AS kind, c.id,
        COALESCE(NULLIF(CASE WHEN json_valid(m.meta) THEN json_extract(m.meta, '$.title') END, ''),
          NULLIF((SELECT substr(group_concat(value, ''), 1, 80) FROM (
            SELECT value, SUM(length(value)) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before_length
            FROM json_tree(CASE WHEN json_valid(ct.content) THEN ct.content ELSE '[]' END, '$[0]')
            WHERE key = 'text' AND type = 'text'
          ) WHERE COALESCE(before_length, 0) < 80), ''), '无标题卡片') AS title,
        '' AS meta, ct.update_time, NULL AS moment_id, c.create_time AS created_at
      FROM cards c JOIN contents ct ON ct.id = c.content_id LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      WHERE c.content_id IN (${marks})
      UNION ALL
      SELECT a.content_id, 'article', a.id, COALESCE(NULLIF(a.title, ''), '无标题文章'), '', ct.update_time, NULL, a.create_time
      FROM articles a JOIN contents ct ON ct.id = a.content_id WHERE a.is_delete = 0 AND a.content_id IN (${marks})
      UNION ALL
      SELECT i.content_id, 'project-item', i.id, COALESCE(NULLIF(i.title, ''), '无标题文档'), COALESCE(p.title, ''), ct.update_time, NULL, i.create_time
      FROM project_item i JOIN contents ct ON ct.id = i.content_id
      LEFT JOIN project p ON p.id = CASE WHEN json_valid(i.projects) THEN json_extract(i.projects, '$[0]') END
      WHERE i.content_id IN (${marks})
      UNION ALL
      SELECT s.content_id, 'diary', d.id, d.date, CASE WHEN dc.n > 1 THEN dc.n || ' 段' ELSE '' END, ct.update_time, s.id, d.create_time
      FROM diary_segments s JOIN diary_entries d ON d.id = s.diary_id JOIN contents ct ON ct.id = s.content_id
      JOIN diary_counts dc ON dc.diary_id = d.id
      WHERE s.content_id IN (${marks})
    `
      )
      .all(...batch, ...batch, ...batch, ...batch, ...batch) as SourceRow[];
    rows.sort(
      (a, b) =>
        ENTITY_REF_PRIORITY[a.kind] - ENTITY_REF_PRIORITY[b.kind] ||
        a.id - b.id ||
        (a.moment_id ?? 0) - (b.moment_id ?? 0)
    );
    for (const row of rows)
      if (!result.has(row.content_id)) {
        if (row.kind === "diary")
          row.title = `${normalizeDiaryDay(row.title ?? "", row.created_at)} 日记`;
        result.set(row.content_id, row);
      }
  }
  return result;
}
