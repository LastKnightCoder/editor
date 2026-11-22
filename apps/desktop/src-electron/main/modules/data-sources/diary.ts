import { basename } from "node:path";
import type Database from "better-sqlite3";
import { requireSourceDef } from "@/features/databases/data-sources";
import { dayKey, normalizeDiaryDay } from "@/utils/diary-day";
import DiaryTable from "../tables/diary";
import type { DataSourceDefinition, SourceRow } from "./types";
import { dateValue, parseTags, selectExisting } from "./types";

interface EntryRow {
  id: number;
  date: string;
  weather: string | null;
  mood: string | null;
  create_time: number;
  words: number;
  tags: string | null;
}

/** 天气、心情存为 {type, value}：表情原样显示，图片显示为「图片」 */
function moodText(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { type?: string; value?: string };
    if (parsed?.type === "emoji") return parsed.value ?? "";
    return parsed?.type === "image" ? "图片" : "";
  } catch {
    return "";
  }
}

/** 片段标签的并集：一天可以有多条片段，每条各自带标签 */
const ENTRY_SQL = `SELECT d.id, d.date, d.weather, d.mood, d.create_time,
    IFNULL((SELECT SUM(IFNULL(c.count, 0)) FROM diary_segments s
      LEFT JOIN content_snapshots c ON c.id = s.content_id WHERE s.diary_id = d.id), 0) AS words,
    (SELECT json_group_array(s.tags) FROM diary_segments s WHERE s.diary_id = d.id) AS tags
  FROM diary_entries d`;

function segmentTags(raw: string | null): string[] {
  const set = new Set<string>();
  for (const item of parseTags(raw)) for (const tag of parseTags(item)) set.add(tag);
  return [...set];
}

function inScope(db: Database.Database, scope: Parameters<DataSourceDefinition["list"]>[1]) {
  const today = dayKey(Date.now());
  const prefix =
    scope.range === "all" ? "" : scope.range === "year" ? today.slice(0, 4) : today.slice(0, 7);
  return (db.prepare(ENTRY_SQL).all() as EntryRow[])
    .map(row => ({ row, day: normalizeDiaryDay(row.date, row.create_time) }))
    .filter(({ day }) => day.startsWith(prefix))
    .sort((a, b) => b.day.localeCompare(a.day) || b.row.id - a.row.id);
}

export const diarySource: DataSourceDefinition = {
  def: requireSourceDef("diary"),
  scopeOptions: () => ({}),
  ids: (db, scope) => inScope(db, scope).map(({ row }) => row.id),
  list(db, scope): SourceRow[] {
    return inScope(db, scope).map(({ row, day }) => ({
      id: row.id,
      values: {
        day,
        date: dateValue(new Date(`${day}T00:00:00`).getTime()),
        weather: moodText(row.weather),
        mood: moodText(row.mood),
        tags: segmentTags(row.tags),
        words: row.words,
      },
    }));
  },
  existing: (db, ids) => selectExisting(db, "diary_entries", ids),
  remove(db, id, ctx) {
    DiaryTable.deleteDiaryEntry(db, id);
    ctx.broadcastAll("diary:changed", { databaseName: basename(db.name) });
  },
};
