import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import VLQuizTable from "../vl-quiz";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
});
afterEach(() => db.close());

describe("测验最高分聚合", () => {
  it("拒绝错误项目成绩与已删除测验的迟到成绩/生成题目", () => {
    const set = VLQuizTable.createQuizSet(db, { projectId: 7, name: "测验" });
    const input = {
      quizSetId: set.id,
      projectId: 8,
      score: 80,
      correctCount: 0,
      totalCount: 1,
      answers: [],
      duration: 1,
    };
    expect(() => VLQuizTable.createQuizRecord(db, input)).toThrow("测验所属项目不一致");
    VLQuizTable.deleteQuizSet(db, set.id);
    expect(() => VLQuizTable.createQuizRecord(db, { ...input, projectId: 7 })).toThrow(
      "测验集已不存在"
    );
    expect(() =>
      VLQuizTable.createQuizItemsBatch(db, [
        { quizSetId: set.id, type: "qa", prompt: [], data: {} },
      ])
    ).toThrow("测验集已不存在");
    expect(db.prepare("SELECT COUNT(*) AS count FROM vl_quiz_record").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM vl_quiz_item").get()).toEqual({ count: 0 });
  });
  it("按测验归属项目隔离，零分保留，无记录测验不伪造分数", () => {
    const a = VLQuizTable.createQuizSet(db, { projectId: 7, name: "测验 A" });
    const b = VLQuizTable.createQuizSet(db, { projectId: 8, name: "测验 B" });
    const zero = VLQuizTable.createQuizSet(db, { projectId: 7, name: "零分" });
    VLQuizTable.createQuizSet(db, { projectId: 7, name: "未作答" });
    for (const [quizSetId, projectId, score] of [
      [a.id, 7, 50],
      [a.id, 7, 90],
      [b.id, 8, 100],
      [zero.id, 7, 0],
    ]) {
      VLQuizTable.createQuizRecord(db, {
        quizSetId,
        projectId,
        score,
        correctCount: 0,
        totalCount: 1,
        answers: [],
        duration: 1,
      });
    }
    expect(VLQuizTable.getBestScores(db, 7)).toEqual({ [a.id]: 90, [zero.id]: 0 });
    expect(VLQuizTable.getBestScores(db, 8)).toEqual({ [b.id]: 100 });
  });

  it("删除测验与成绩后，聚合不保留陈旧结果", () => {
    const set = VLQuizTable.createQuizSet(db, { projectId: 7, name: "测验" });
    VLQuizTable.createQuizRecord(db, {
      quizSetId: set.id,
      projectId: 7,
      score: 80,
      correctCount: 0,
      totalCount: 1,
      answers: [],
      duration: 1,
    });
    VLQuizTable.deleteQuizSet(db, set.id);
    expect(VLQuizTable.getBestScores(db, 7)).toEqual({});
  });
});
