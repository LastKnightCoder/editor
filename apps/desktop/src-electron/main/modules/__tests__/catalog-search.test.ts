import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";
vi.mock("electron");
vi.mock("../video-note-index-queue");
import CatalogSearchTable from "../tables/catalog-search";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
});
afterEach(() => db.close());

it("按名称找到项目、白板、Notebook、PDF 和数据库，归档对象不占用结果", () => {
  db.exec(`
    INSERT INTO project(id,title,create_time,update_time,archived) VALUES (1,'复盘项目',1,1,0),(2,'复盘旧项目',1,2,1);
    INSERT INTO white_boards(id,title,description,create_time,update_time) VALUES (3,'思路','复盘流程',1,3);
    INSERT INTO vibe_learning_project(id,title,create_time,update_time) VALUES (4,'复盘学习',1,4);
    INSERT INTO pdfs(id,file_name,is_local,create_time,update_time) VALUES (5,'复盘.pdf',1,1,5);
    INSERT INTO database_item(id,title,archived,create_time,update_time) VALUES (6,'复盘数据',0,1,6),(7,'复盘旧表',1,1,7);
  `);
  const results = CatalogSearchTable.search(db, {
    types: ["project", "whiteboard", "notebook", "pdf", "database"],
    keyword: "复盘",
  });
  expect(results.map(row => [row.type, row.id])).toEqual([
    ["database", 6],
    ["pdf", 5],
    ["notebook", 4],
    ["whiteboard", 3],
    ["project", 1],
  ]);
});

it("闪卡能按跨格式的题目和答案查找，不把正文格式字段当成命中", () => {
  db.exec("INSERT INTO flashcard_decks(id,name,create_time,update_time) VALUES (1,'知识',1,1)");
  const insert =
    db.prepare(`INSERT INTO flashcards(id,deck_id,type,prompt,detail,data,due_time,create_time,update_time)
    VALUES (?,1,'qa',?,'',?,0,1,1)`);
  insert.run(
    1,
    JSON.stringify([
      { type: "paragraph", children: [{ text: "年度" }, { text: "复盘", bold: true }] },
    ]),
    JSON.stringify({ answer: "回顾并调整" })
  );
  expect(
    CatalogSearchTable.search(db, { types: ["flashcard"], keyword: "年度复盘" })[0]
  ).toMatchObject({ id: 1, title: "年度复盘" });
  expect(CatalogSearchTable.search(db, { types: ["flashcard"], keyword: "调整" })[0]).toMatchObject(
    { id: 1, snippet: "回顾并调整" }
  );
  expect(CatalogSearchTable.search(db, { types: ["flashcard"], keyword: "paragraph" })).toEqual([]);
});

it("会话搜索保留所属对象，排除归档、来源已删和退役场景", () => {
  db.exec(`
    INSERT INTO pdfs(id,file_name,is_local,create_time,update_time) VALUES (1,'书.pdf',1,1,1);
    INSERT INTO vibe_learning_project(id,title,create_time,update_time) VALUES (2,'学习',1,1);
    INSERT INTO chat_session(id,title,scope,domain_ref,session_file,archived,create_time,update_time) VALUES
      ('main','复盘','main-chat',NULL,'main',0,1,1),
      ('pdf','复盘','pdf-chat','1','pdf',0,1,2),
      ('notebook','复盘','vibe-learning-chat','2','notebook',0,1,3),
      ('gone','复盘','pdf-chat','99','gone',0,1,4),
      ('archived','复盘','main-chat',NULL,'archived',1,1,5),
      ('legacy','复盘','video-note-chat','1','legacy',0,1,6);
  `);
  const results = CatalogSearchTable.search(db, { types: ["chat-session"], keyword: "复盘" });
  expect(results.map(row => row.sessionId)).toEqual(["notebook", "pdf", "main"]);
  expect(results[0]).toMatchObject({ chatScope: "vibe-learning-chat", domainId: 2 });
  expect(results[1]).toMatchObject({ chatScope: "pdf-chat", domainId: 1 });
});
