import type Database from "better-sqlite3";
import { QUERY_LIMITS, type QueryRecord } from "@tau/shared/query-database";
import type { PluginDataRecord, PluginDataScope, PluginDataQuery } from "@/types/plugin-data";
import { normalizeDiaryDay } from "@/utils/diary-day";
import PluginDataTable from "./tables/plugin-data";

const list = (raw: string | null): unknown[] => {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
function mood(raw: string | null): string {
  try {
    const value = JSON.parse(raw || "null") as { type?: string; value?: string } | null;
    return value?.type === "emoji" ? (value.value ?? "") : value?.type === "image" ? "图片" : "";
  } catch {
    return "";
  }
}
export function readQueryDiary(db: Database.Database): QueryRecord[] {
  const rows = db
    .prepare(`SELECT d.id,d.date,d.create_time,d.weather,d.mood,
    IFNULL((SELECT SUM(IFNULL(c.count,0)) FROM diary_segments s
      LEFT JOIN content_snapshots c ON c.id=s.content_id WHERE s.diary_id=d.id),0) AS words,
    (SELECT json_group_array(s.tags) FROM diary_segments s WHERE s.diary_id=d.id) AS tags
    FROM diary_entries d`)
    .all() as {
    id: number;
    date: string;
    create_time: number;
    weather: string | null;
    mood: string | null;
    words: number;
    tags: string | null;
  }[];
  return rows
    .map(row => {
      const day = normalizeDiaryDay(row.date, row.create_time);
      return {
        id: `diary:${row.id}`,
        title: day,
        date: day,
        wordCount: row.words,
        weather: mood(row.weather),
        mood: mood(row.mood),
        tags: [
          ...new Set(
            list(row.tags).flatMap(tags =>
              typeof tags === "string"
                ? list(tags).filter((tag): tag is string => typeof tag === "string")
                : []
            )
          ),
        ],
        source: { kind: "diary", id: String(row.id), title: day },
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id.slice(6)) - Number(a.id.slice(6)));
}

export function readProjectDocuments(
  db: Database.Database,
  scope: PluginDataScope,
  projectId: number,
  deep: boolean,
  offset: number,
  options: Pick<PluginDataQuery, "tag" | "createdAfter" | "updatedAfter"> = {}
): { items: (PluginDataRecord & { parent: string })[]; cursor?: string } {
  if (options.tag !== undefined && !options.tag.trim()) throw new Error("标签无效");
  if (
    [options.createdAfter, options.updatedAfter].some(
      value => value !== undefined && !Number.isFinite(value)
    )
  )
    throw new Error("时间范围无效");
  const project = db.prepare("SELECT children FROM project WHERE id=?").get(projectId) as
    | { children: string }
    | undefined;
  if (!project) return { items: [] };
  const read = db.prepare("SELECT title,children FROM project_item WHERE id=?");
  const ids = (raw: string) =>
    list(raw).filter(
      (id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0
    );
  const stack = ids(project.children)
    .reverse()
    .map(id => ({ id, parent: "" }));
  const seen = new Set<number>();
  const selected: { id: number; parent: string }[] = [];
  while (stack.length) {
    const next = stack.pop();
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    if (seen.size > QUERY_LIMITS.readRows) throw new Error("读取的项目条目过多，请缩小范围");
    const item = read.get(next.id) as { title: string; children: string } | undefined;
    if (!item) continue;
    selected.push(next);
    if (deep) for (const id of ids(item.children).reverse()) stack.push({ id, parent: item.title });
  }
  const end = Math.min(offset + 200, selected.length);
  return {
    items: selected.slice(offset, end).flatMap(item => {
      const value = PluginDataTable.get(db, { ...scope, entity: "document", id: item.id });
      if (
        value &&
        ((options.tag !== undefined &&
          !value.tags.some(tag => tag === options.tag || tag.startsWith(options.tag + "/"))) ||
          (options.createdAfter !== undefined && value.createdAt < options.createdAfter) ||
          (options.updatedAfter !== undefined && value.updatedAt < options.updatedAfter))
      )
        return [];
      return value ? [{ ...value, parent: item.parent }] : [];
    }),
    ...(end < selected.length ? { cursor: String(end) } : {}),
  };
}
