// @vitest-environment node
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron");
vi.mock("../../video-note-index-queue");

import CardTable from "../card";
import ArticleTable from "../article";

const scope = { databaseName: "main" };
let db: Database.Database;
let dir: string;

const addCard = (tags: string[]) =>
  Number(
    db
      .prepare(
        "INSERT INTO cards (create_time, update_time, tags, content_id, is_top) VALUES (1, 1, ?, 0, 0)"
      )
      .run(JSON.stringify(tags)).lastInsertRowid
  );
const cardTags = (id: number) =>
  JSON.parse((db.prepare("SELECT tags FROM cards WHERE id = ?").get(id) as { tags: string }).tags);

const addArticle = (tags: string[], deleted = false) =>
  Number(
    db
      .prepare(
        "INSERT INTO articles (title, create_time, update_time, tags, links, is_top, is_delete, content_id) VALUES ('a', 1, 1, ?, '[]', 0, ?, 0)"
      )
      .run(JSON.stringify(tags), deleted ? 1 : 0).lastInsertRowid
  );
const articleTags = (id: number) =>
  JSON.parse(
    (db.prepare("SELECT tags FROM articles WHERE id = ?").get(id) as { tags: string }).tags
  );

beforeEach(() => {
  // 命令按库文件名校验作用域，内存库没有文件名，用临时目录里的 main.db
  dir = mkdtempSync(join(tmpdir(), "tag-rename-"));
  db = new Database(join(dir, "main.db"));
  db.exec(schema);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("卡片标签批量改名 / 删除", () => {
  it("改父级时子标签跟着改，前缀相同但不是子级的标签不受影响", () => {
    const child = addCard(["前端/CSS", "算法"]);
    const parent = addCard(["前端"]);
    const lookalike = addCard(["前端工程"]);

    CardTable.renameScopedTag(db, { ...scope, from: "前端", to: "Web" });

    expect(cardTags(child)).toEqual(["Web/CSS", "算法"]);
    expect(cardTags(parent)).toEqual(["Web"]);
    expect(cardTags(lookalike)).toEqual(["前端工程"]);
  });

  it("改成已有名字即合并：同一张卡片上的重复标签只留一个，位置取先出现的", () => {
    const both = addCard(["前端/css", "算法", "前端/CSS"]);

    const changed = CardTable.renameScopedTag(db, { ...scope, from: "前端/css", to: "前端/CSS" });

    expect(cardTags(both)).toEqual(["前端/CSS", "算法"]);
    expect(changed.map(card => card.id)).toEqual([both]);
  });

  it("删除只摘标签（连同子标签），只返回真正变了的卡片", () => {
    const tagged = addCard(["读书/经济", "读书", "思考"]);
    const untouched = addCard(["思考"]);

    const changed = CardTable.removeScopedTag(db, { ...scope, tag: "读书" });

    expect(cardTags(tagged)).toEqual(["思考"]);
    expect(cardTags(untouched)).toEqual(["思考"]);
    expect(changed.map(card => card.id)).toEqual([tagged]);
  });

  it("目标名为空白时拒绝，数据不动", () => {
    const id = addCard(["前端"]);
    expect(() => CardTable.renameScopedTag(db, { ...scope, from: "前端", to: "  " })).toThrow();
    expect(cardTags(id)).toEqual(["前端"]);
  });
});

describe("文章标签批量改名 / 删除", () => {
  it("文章标签不分层：改「读书」不动「读书/经济」，回收站里的文章不动", () => {
    const flat = addArticle(["读书", "读书/经济"]);
    const trashed = addArticle(["读书"], true);

    ArticleTable.renameScopedTag(db, { ...scope, from: "读书", to: "阅读" });

    expect(articleTags(flat)).toEqual(["阅读", "读书/经济"]);
    expect(articleTags(trashed)).toEqual(["读书"]);
  });
});
