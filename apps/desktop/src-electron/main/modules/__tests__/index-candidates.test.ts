import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";
import { listContentIndexCandidates } from "../index-candidates";
import ContentTable from "../tables/content";

vi.mock("../tables/content", () => ({
  default: { readText: vi.fn(async () => ({ content: "正文", sections: [] })) },
}));

describe("索引轻量候选", () => {
  const db = new Database(":memory:");
  db.exec(mainSchema);
  afterEach(() => {
    vi.clearAllMocks();
    db.exec(
      "DELETE FROM cards; DELETE FROM articles; DELETE FROM content_documents; DELETE FROM contents;"
    );
  });

  it("只在读取变化项时请求正文文本，时间取实体和正文较新者，排除软删除文章", async () => {
    db.prepare(
      "INSERT INTO contents (id, create_time, update_time, content, count) VALUES (1, 0, 50, ?, 1)"
    ).run('[{"type":"paragraph","children":[{"text":"正文"}]}]');
    db.exec(
      "INSERT INTO cards (id, create_time, update_time, tags, content_id) VALUES (1, 0, 10, '[]', 1)"
    );
    db.exec(
      "INSERT INTO articles (id, create_time, update_time, title, tags, content_id, is_delete) VALUES (2, 0, 80, '文章', '[]', 1, 0), (3, 0, 90, '已删', '[]', 1, 1)"
    );
    const prepare = vi.spyOn(db, "prepare");
    const rows = [...listContentIndexCandidates(db)];
    expect(rows.map(({ id, type, updateTime }) => ({ id, type, updateTime }))).toEqual([
      { id: 1, type: "card", updateTime: 50 },
      { id: 2, type: "article", updateTime: 80 },
    ]);
    const queries = prepare.mock.calls.map(([sql]) => sql);
    expect(queries.some(sql => sql.includes("podcasts") || sql.includes("content_links"))).toBe(
      false
    );
    expect(
      queries.filter(sql => sql.includes("JOIN contents")).every(sql => !sql.includes("c.content,"))
    ).toBe(true);
    expect(ContentTable.readText).not.toHaveBeenCalled();
    const signal = new AbortController().signal;
    expect(await rows[0].read(false, signal)).toEqual({ content: "正文", sections: [] });
    expect(ContentTable.readText).toHaveBeenCalledWith(db, 1, "", true, false, signal);
    prepare.mockRestore();
  });
});
