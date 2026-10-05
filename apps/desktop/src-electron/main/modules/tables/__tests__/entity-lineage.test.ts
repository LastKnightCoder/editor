import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import EntityLineageTable from "../entity-lineage";

describe("EntityLineageTable", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  it("同一条谱系只记一次；对话 id 保留字符串，消息位置随来源返回", () => {
    const record = {
      src: { kind: "chat-session" as const, id: "s-1" },
      dst: { kind: "card" as const, id: 7 },
      relation: "saved_from" as const,
      srcAnchor: { messageIds: ["a1", "a2"] },
    };
    expect(EntityLineageTable.record(db, record)).toBe(true);
    expect(EntityLineageTable.record(db, record)).toBe(false);

    const [source] = EntityLineageTable.sourcesOf(db, [{ kind: "card", id: 7 }]);
    expect(source.node).toEqual({ kind: "chat-session", id: "s-1" });
    expect(source.relation).toBe("saved_from");
    expect(source.anchor).toEqual({ messageIds: ["a1", "a2"] });
  });

  it("按多个身份查来源与衍生；不认识的端点被丢弃", () => {
    EntityLineageTable.record(db, {
      src: { kind: "vl-note", id: 3 },
      dst: { kind: "project-item", id: 11 },
      relation: "derived",
    });
    EntityLineageTable.record(db, {
      src: { kind: "card", id: 7 },
      dst: { kind: "flashcard", id: 20 },
      relation: "saved_from",
    });
    db.exec(`INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time)
      VALUES ('card', '7', 'unknown', '1', 'derived', 1), ('card', '7', 'card', 'x', 'derived', 1)`);

    const identities = [
      { kind: "card" as const, id: 7 },
      { kind: "project-item" as const, id: 11 },
    ];
    expect(EntityLineageTable.sourcesOf(db, identities).map(edge => edge.node)).toEqual([
      { kind: "vl-note", id: 3 },
    ]);
    expect(EntityLineageTable.derivedOf(db, identities).map(edge => edge.node)).toEqual([
      { kind: "flashcard", id: 20 },
    ]);
    expect(EntityLineageTable.sourcesOf(db, [])).toEqual([]);
  });

  it("按来源与关系找衍生（剪藏：网页条目 → 解析文档）", () => {
    EntityLineageTable.record(db, {
      src: { kind: "project-item", id: 5 },
      dst: { kind: "web-clip", id: 9 },
      relation: "clipped_from",
    });
    expect(
      EntityLineageTable.findDst(db, { kind: "project-item", id: 5 }, "clipped_from", "web-clip")
    ).toEqual([{ kind: "web-clip", id: 9 }]);
    expect(EntityLineageTable.findDst(db, { kind: "project-item", id: 5 }, "derived")).toEqual([]);
  });

  it("拒绝未知关系", () => {
    expect(() =>
      EntityLineageTable.record(db, {
        src: { kind: "card", id: 1 },
        dst: { kind: "card", id: 2 },
        relation: "copied" as never,
      })
    ).toThrow();
  });
});
