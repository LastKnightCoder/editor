import { createSharedDocument } from "@tau/collaboration/src/testing/legacy-document";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSharedContent } from "@tau/collaboration";
import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import { diaryLinkPatcher, upgradeDiaryEntityReferences } from "../diary-entity-upgrade";
import { patchSessionNodes } from "../collaboration/content-sessions";

describe("日级引用升级为碎碎念身份", () => {
  let db: Database.Database;
  const link = (contentId?: number) => ({
    type: "content-link",
    contentType: "diary-daily",
    refId: 5,
    contentId,
    contentTitle: "日记",
    children: [{ text: "日记" }],
  });
  const contentOf = (id: number) =>
    JSON.parse(
      (db.prepare("SELECT content FROM contents WHERE id = ?").get(id) as { content: string })
        .content
    );
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    db.prepare(
      "INSERT INTO diary_entries (id, type, date, create_time, update_time) VALUES (5, 'daily', '2026-10-08', 1, 1)"
    ).run();
    for (const id of [101, 102]) {
      db.prepare(
        "INSERT INTO contents (id, content, create_time, update_time, ref_count) VALUES (?, '[]', 7, 8, 2)"
      ).run(id);
    }
    db.exec(
      "INSERT INTO diary_segments (id, diary_id, content_id, create_time, update_time) VALUES (11, 5, 101, 1, 1), (12, 5, 102, 2, 2)"
    );
  });
  afterEach(() => db.close());

  it("链接按命中的正文转为第二条，白板按 segmentId 转换，编辑时间与引用计数不变且可重复执行", () => {
    const content = [{ type: "paragraph", children: [link(102), link()] }];
    db.prepare("UPDATE contents SET content = ? WHERE id = 101").run(JSON.stringify(content));
    db.prepare(
      "INSERT INTO white_board_contents (id, create_time, update_time, data) VALUES (1, 9, 10, ?)"
    ).run(
      JSON.stringify({
        children: [
          { type: "document", entityRef: { kind: "diary", id: 5 }, segmentId: 12, title: "保留" },
        ],
      })
    );
    expect(upgradeDiaryEntityReferences(db)).toBe(2);
    expect(contentOf(101)[0].children).toEqual([
      { ...link(102), contentType: "diary-moment", refId: 12 },
      { ...link(101), contentType: "diary-moment", refId: 11 },
    ]);
    const board = db
      .prepare("SELECT data, update_time FROM white_board_contents WHERE id = 1")
      .get() as { data: string; update_time: number };
    expect(JSON.parse(board.data).children[0]).toEqual({
      type: "document",
      entityRef: { kind: "diary-moment", id: 12 },
      title: "保留",
    });
    expect(board.update_time).toBe(10);
    expect(db.prepare("SELECT update_time, ref_count FROM contents WHERE id = 101").get()).toEqual({
      update_time: 8,
      ref_count: 2,
    });
    expect(upgradeDiaryEntityReferences(db)).toBe(0);
  });

  it("Notebook 与日级谱系转到正文身份，日级谱系覆盖原日期容器的所有片段", () => {
    db.prepare(
      "INSERT INTO vibe_learning_project (id, title, create_time, update_time) VALUES (1, '项目', 1, 1)"
    ).run();
    db.prepare(
      "INSERT INTO vibe_learning_resources (id, project_id, name, original_path, resource_type, source_type, source_meta_info, create_time, update_time) VALUES (1, 1, '日记', '', 'md', 'note', ?, 1, 1)"
    ).run(JSON.stringify({ type: "diary-daily", contentId: 102, originalId: 5 }));
    db.exec(
      "INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time) VALUES ('diary', '5', 'card', '7', 'derived', 1)"
    );
    upgradeDiaryEntityReferences(db);
    const note = db
      .prepare("SELECT source_meta_info FROM vibe_learning_resources WHERE id = 1")
      .get() as { source_meta_info: string };
    expect(JSON.parse(note.source_meta_info)).toEqual({
      type: "diary-moment",
      contentId: 102,
      originalId: 12,
    });
    expect(db.prepare("SELECT src_kind, src_id FROM entity_lineage ORDER BY src_id").all()).toEqual(
      [
        { src_kind: "diary-moment", src_id: "11" },
        { src_kind: "diary-moment", src_id: "12" },
      ]
    );
    expect(upgradeDiaryEntityReferences(db)).toBe(0);
  });

  it("待办与闪卡按已关联的正文更新类型，引用计数与编辑时间不变", () => {
    db.exec(
      "INSERT INTO todo_note_link (id, todo_id, content_id, type, create_time, update_time) VALUES (1, 7, 102, 'diary-daily', 1, 2)"
    );
    db.exec(
      "INSERT INTO flashcard_references (id, card_id, content_id, ref_type, title, create_time, update_time) VALUES (1, 7, 102, 'diary-daily', '日记', 1, 2)"
    );
    expect(upgradeDiaryEntityReferences(db)).toBe(2);
    expect(db.prepare("SELECT type, content_id, update_time FROM todo_note_link").get()).toEqual({
      type: "diary-moment",
      content_id: 102,
      update_time: 2,
    });
    expect(
      db.prepare("SELECT ref_type, content_id, update_time FROM flashcard_references").get()
    ).toEqual({ ref_type: "diary-moment", content_id: 102, update_time: 2 });
    expect(db.prepare("SELECT ref_count FROM contents WHERE id = 102").get()).toEqual({
      ref_count: 2,
    });
  });

  it("转换失败时整批回滚，不能留下半转换的引用", () => {
    const content = [{ type: "paragraph", children: [link(102)] }];
    db.prepare("UPDATE contents SET content = ? WHERE id = 101").run(JSON.stringify(content));
    db.exec(
      "INSERT INTO white_board_contents (id, create_time, update_time, data) VALUES (1, 1, 1, '{diary')"
    );
    expect(() => upgradeDiaryEntityReferences(db)).toThrow();
    expect(contentOf(101)).toEqual(content);
  });

  it("缓存的 Yjs 会话只修正引用属性，不改正文与文档身份", () => {
    const doc = createSharedDocument(
      {
        title: "原文",
        content: [{ type: "paragraph", children: [{ text: "前文" }, link(102), { text: "后文" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      undefined,
      "local"
    );
    try {
      const session = { doc, info: { status: "active" } } as never;
      const before = readSharedContent(doc);
      expect(patchSessionNodes(session, diaryLinkPatcher(db))).toBe(1);
      const children = before.content[0].children as Array<Record<string, unknown>>;
      expect(readSharedContent(doc).content[0].children).toEqual([
        children[0],
        { ...children[1], contentType: "diary-moment", refId: 12 },
        children[2],
      ]);
      expect(patchSessionNodes(session, diaryLinkPatcher(db))).toBe(0);
    } finally {
      doc.destroy();
    }
  });
});
