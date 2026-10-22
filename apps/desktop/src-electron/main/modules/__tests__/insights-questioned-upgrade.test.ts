import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upgradeQuestionedInsights } from "../insights-questioned-upgrade";
import { markKey } from "../tables/knowledge-ai-insights";

const MAIN_SQL = readFileSync(
  resolve(__dirname, "../../../../../../packages/db-schema/schema/main.sql"),
  "utf8"
);

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(MAIN_SQL);
});

afterEach(() => db.close());

const contentResult = {
  lead: "",
  candidates: 0,
  marks: [
    { id: "m1", kind: "conflict", status: "questioned" },
    { id: "m2", kind: "link", status: "linked" },
  ],
  asks: [{ id: "q1", text: "为什么", status: "questioned" }],
};

const gap = {
  id: "g1",
  kind: "gap",
  ends: [],
  text: "还缺：模块加载",
  why: "",
  status: "questioned",
};
const knowledgeResult = {
  lead: "",
  marks: [gap, { id: "g2", kind: "bridge", ends: [], why: "", status: "open" }],
  asks: [{ id: "q1", text: "继续想", status: "questioned" }],
  growth: [],
  candidates: 0,
  dismissed: ["old"],
};

const insertContent = (id: number, result: unknown, updateTime = 5) =>
  db
    .prepare(
      `INSERT INTO content_ai_insights (content_id, schema_ver, text_digest, result, model, create_time, update_time)
       VALUES (?, 1, 'd', ?, 'p/m', 1, ?)`
    )
    .run(id, typeof result === "string" ? result : JSON.stringify(result), updateTime);

const insertKnowledge = (result: unknown) =>
  Number(
    db
      .prepare(
        `INSERT INTO knowledge_ai_insights (scope, label, members, overview, result, increments, model, create_time, update_time)
         VALUES ('subtopic', 'x', '[]', '{}', ?, 0, 'p/m', 1, 5)`
      )
      .run(JSON.stringify(result)).lastInsertRowid
  );

const read = (sql: string, id: number) =>
  JSON.parse((db.prepare(sql).get(id) as { result: string }).result);

describe("upgradeQuestionedInsights", () => {
  it("questioned 改为 dismissed；知识洞见的标记记进 dismissed 身份；不改 update_time，幂等", () => {
    insertContent(1, contentResult);
    insertContent(2, { ...contentResult, marks: [], asks: [] });
    insertContent(3, "{坏的 questioned");
    const knowledgeId = insertKnowledge(knowledgeResult);

    expect(upgradeQuestionedInsights(db)).toBe(2);
    const content = read(`SELECT result FROM content_ai_insights WHERE content_id = ?`, 1);
    expect(content.marks.map((m: { status: string }) => m.status)).toEqual(["dismissed", "linked"]);
    expect(content.asks[0].status).toBe("dismissed");
    expect(
      (
        db.prepare(`SELECT update_time FROM content_ai_insights WHERE content_id = 1`).get() as {
          update_time: number;
        }
      ).update_time
    ).toBe(5);

    const knowledge = read(`SELECT result FROM knowledge_ai_insights WHERE id = ?`, knowledgeId);
    expect(knowledge.marks.map((m: { status: string }) => m.status)).toEqual(["dismissed", "open"]);
    expect(knowledge.asks[0].status).toBe("dismissed");
    expect(knowledge.dismissed).toEqual(["old", markKey(gap as never)]);

    expect(upgradeQuestionedInsights(db)).toBe(0);
  });
});
