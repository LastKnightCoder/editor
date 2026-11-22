import type Database from "better-sqlite3";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import { requireSourceDef } from "@/features/databases/data-sources";
import CardTable from "../tables/card";
import { contentTitles } from "../tables/content-ai-meta";
import type { DataSourceDefinition, SourceRow } from "./types";
import { dateValue, matchesTags, parseTags, selectExisting, sortedTags, tagPatch } from "./types";

const TITLE_LENGTH = 50;

interface CardRow {
  id: number;
  created: number;
  updated: number;
  tags: string | null;
  pinned: number;
  content_id: number | null;
  words: number;
}

const CARD_SQL = `SELECT c.id, c.create_time AS created,
    MAX(c.update_time, IFNULL(ct.update_time, 0)) AS updated,
    c.tags, c.is_top AS pinned, c.content_id, IFNULL(ct.count, 0) AS words
  FROM cards c LEFT JOIN content_snapshots ct ON ct.id = c.content_id
  ORDER BY c.create_time DESC, c.id DESC`;

function inScope(db: Database.Database, scope: Parameters<DataSourceDefinition["list"]>[1]) {
  return (db.prepare(CARD_SQL).all() as CardRow[]).filter(row =>
    matchesTags(parseTags(row.tags), scope)
  );
}

export const cardSource: DataSourceDefinition = {
  def: requireSourceDef("card"),
  scopeOptions(db) {
    return { tags: sortedTags(db.prepare("SELECT tags FROM cards").all() as { tags: string }[]) };
  },
  ids: (db, scope) => inScope(db, scope).map(row => row.id),
  list(db, scope): SourceRow[] {
    const rows = inScope(db, scope);
    const titles = contentTitles(
      db,
      rows.flatMap(row => (row.content_id ? [row.content_id] : [])),
      TITLE_LENGTH
    );
    return rows.map(row => ({
      id: row.id,
      contentId: row.content_id ?? undefined,
      values: {
        title: (row.content_id && titles.get(row.content_id)) || "",
        tags: parseTags(row.tags),
        pinned: Boolean(row.pinned),
        created: dateValue(row.created),
        updated: dateValue(row.updated),
        words: row.words,
      },
    }));
  },
  existing: (db, ids) => selectExisting(db, "cards", ids),
  write(db, id, patch, ctx) {
    const card = CardTable.getCardById(db, id);
    if (!card) throw new Error("卡片已不存在");
    CardTable.updateCard(
      db,
      {
        ...card,
        tags: "tags" in patch ? tagPatch(patch.tags) : card.tags,
        isTop: "pinned" in patch ? Boolean(patch.pinned) : card.isTop,
      },
      ctx
    );
  },
  create(db, scope) {
    return CardTable.createCard(db, {
      content: DEFAULT_CARD_CONTENT,
      tags: scope.tags ?? [],
      isTop: false,
      count: 0,
    } as Parameters<typeof CardTable.createCard>[1]).id;
  },
  remove(db, id) {
    CardTable.deleteCard(db, id);
  },
};
