import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { KnowledgeInsightResult, KnowledgeMark } from "@/types/knowledge-insights";
import KnowledgeAiInsightsTable, {
  emptyResult,
  linkCardsMutually,
  markKey,
  memberChange,
  memberOverlap,
  mergeResults,
  type KnowledgeAiInsightsInput,
} from "../knowledge-ai-insights";

const end = (contentId: number) => ({
  ref: { kind: "card" as const, id: contentId },
  contentId,
  title: `卡 ${contentId}`,
  topic: "主题",
  heading: "",
  block: 0,
  excerpt: "",
});
const mark = (id: string, ends: number[], extra: Partial<KnowledgeMark> = {}): KnowledgeMark => ({
  id,
  kind: "dup",
  why: "理由",
  ends: ends.map(end),
  status: "open",
  ...extra,
});
const result = (marks: KnowledgeMark[]): KnowledgeInsightResult => ({
  ...emptyResult(),
  lead: "两三句",
  marks,
  asks: [{ id: "q1", text: "为什么？", status: "open" }],
});
const input = (marks: KnowledgeMark[], extra: Partial<KnowledgeAiInsightsInput> = {}) => ({
  scope: "subtopic" as const,
  parentId: null,
  projectId: null,
  label: "事件循环",
  members: [
    [1, "a"],
    [2, "b"],
  ] as Array<[number, string]>,
  overview: { overview: "概述", shift: "" },
  result: result(marks),
  increments: 0,
  model: "deepseek/flash",
  ...extra,
});

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(schema);
});
afterEach(() => db.close());

describe("knowledge_ai_insights 纯函数", () => {
  it("标记身份与两端顺序无关，不涉及笔记的用文字", () => {
    expect(markKey(mark("m1", [3, 1]))).toBe(markKey(mark("m9", [1, 3])));
    expect(markKey(mark("m1", [], { kind: "gap", text: " 模块加载 " }))).toBe(
      markKey(mark("m2", [], { kind: "gap", text: "模块加载" }))
    );
    expect(markKey(mark("m1", [1, 3]))).not.toBe(markKey(mark("m1", [1, 3], { kind: "conflict" })));
  });

  it("重新生成继承已处理的状态，不相关的不再出现、身份带下去", () => {
    const previous = result([
      mark("m1", [1, 2], { status: "linked" }),
      mark("m2", [3, 4], { status: "dismissed" }),
    ]);
    const merged = mergeResults(previous, result([mark("x1", [2, 1]), mark("x2", [4, 3])]));
    expect(merged.marks).toHaveLength(1);
    expect(merged.marks[0]).toMatchObject({ id: "x1", status: "linked" });
    // 中间一轮没再提出，再下一轮提出时仍不出现
    const later = mergeResults(mergeResults(merged, result([])), result([mark("y", [3, 4])]));
    expect(later.marks).toHaveLength(0);
  });

  it("成员重合度与变化量", () => {
    const a: Array<[number, string]> = [
      [1, "a"],
      [2, "b"],
      [3, "c"],
      [4, "d"],
    ];
    expect(memberOverlap(a, a)).toBe(1);
    expect(
      memberOverlap(a, [
        [1, "a"],
        [2, "b"],
        [3, "c"],
        [5, "e"],
      ])
    ).toBeCloseTo(3 / 5);
    // 改了 1 份元信息、新增 1 份、移除 1 份 → 3 / 4
    expect(
      memberChange(a, [
        [1, "a"],
        [2, "b2"],
        [3, "c"],
        [5, "e"],
      ])
    ).toBeCloseTo(3 / 4);
    expect(memberChange([], a)).toBe(Infinity);
  });
});

describe("KnowledgeAiInsightsTable", () => {
  it("新建、覆盖继承状态、只改状态不动生成时间", () => {
    const row = KnowledgeAiInsightsTable.save(db, input([mark("m1", [1, 2])]), null, 1000);
    expect(row).toMatchObject({ scope: "subtopic", label: "事件循环", createTime: 1000 });
    expect(KnowledgeAiInsightsTable.setStatus(db, row.id, "m1", "dismissed")).toBe(true);
    expect(KnowledgeAiInsightsTable.setStatus(db, row.id, "q1", "questioned")).toBe(true);
    expect(() => KnowledgeAiInsightsTable.setStatus(db, row.id, "m1", "bogus" as never)).toThrow();
    expect(KnowledgeAiInsightsTable.setStatus(db, row.id, "nope", "linked")).toBe(false);
    expect(KnowledgeAiInsightsTable.get(db, row.id)!.updateTime).toBe(1000);

    const next = KnowledgeAiInsightsTable.save(
      db,
      input([mark("n1", [2, 1]), mark("n2", [5, 6])], { increments: 1 }),
      row.id,
      2000
    );
    expect(next.id).toBe(row.id);
    expect(next.createTime).toBe(1000);
    expect(next.updateTime).toBe(2000);
    expect(next.increments).toBe(1);
    expect(next.result.marks.map(item => item.id)).toEqual(["n2"]);
    expect(next.result.asks[0].status).toBe("questioned");
  });

  it("认不出的处理状态按未处理读", () => {
    const row = KnowledgeAiInsightsTable.save(db, input([mark("m1", [1, 2])]));
    db.prepare(`UPDATE knowledge_ai_insights SET result = ? WHERE id = ?`).run(
      JSON.stringify(result([mark("m1", [1, 2], { status: "seen" as never })])),
      row.id
    );
    expect(KnowledgeAiInsightsTable.get(db, row.id)!.result.marks[0].status).toBe("open");
  });

  it("按范围列出、取项目回顾、只换成员", () => {
    const topic = KnowledgeAiInsightsTable.save(db, input([], { scope: "topic", label: "JS" }));
    KnowledgeAiInsightsTable.save(db, input([], { parentId: topic.id }));
    KnowledgeAiInsightsTable.save(db, input([], { scope: "project", projectId: 7 }));
    expect(KnowledgeAiInsightsTable.list(db, "subtopic")).toHaveLength(1);
    expect(KnowledgeAiInsightsTable.list(db)).toHaveLength(3);
    expect(KnowledgeAiInsightsTable.getProject(db, 7)?.scope).toBe("project");
    KnowledgeAiInsightsTable.updateMembers(db, topic.id, [[9, "z"]], "JavaScript", null);
    expect(KnowledgeAiInsightsTable.get(db, topic.id)).toMatchObject({
      label: "JavaScript",
      members: [[9, "z"]],
    });
    // 删主题连带它的子主题
    KnowledgeAiInsightsTable.delete(db, topic.id);
    expect(KnowledgeAiInsightsTable.list(db).map(row => row.scope)).toEqual(["project"]);
  });

  it("清理：项目已删除的回顾、成员全不存在的主题；全局与成员还在的保留", () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO contents (id, content, create_time, update_time, count) VALUES (1, '[]', ?, ?, 1)`
    ).run(now, now);
    KnowledgeAiInsightsTable.save(db, input([]));
    KnowledgeAiInsightsTable.save(
      db,
      input([], {
        members: [
          [8, ""],
          [9, ""],
        ],
      })
    );
    KnowledgeAiInsightsTable.save(db, input([], { scope: "global", members: [] }));
    KnowledgeAiInsightsTable.save(db, input([], { scope: "project", projectId: 404 }));
    expect(KnowledgeAiInsightsTable.removeOrphans(db)).toBe(2);
    expect(KnowledgeAiInsightsTable.list(db).map(row => row.scope)).toEqual(["subtopic", "global"]);
  });

  it("两张卡片互相连接：两边各补一条，已连着的不重复，卡片不存在时不写", () => {
    const card = (links: number[]) =>
      Number(
        db
          .prepare(
            `INSERT INTO cards (create_time, update_time, tags, links) VALUES (1, 1, '[]', ?)`
          )
          .run(JSON.stringify(links)).lastInsertRowid
      );
    const a = card([]);
    const b = card([a]);
    const linksOf = (id: number) =>
      JSON.parse(
        (db.prepare(`SELECT links FROM cards WHERE id = ?`).get(id) as { links: string }).links
      );
    expect(linkCardsMutually(db, a, b, 9)).toEqual([a]);
    expect(linksOf(a)).toEqual([b]);
    expect(linksOf(b)).toEqual([a]);
    expect(linkCardsMutually(db, a, b)).toEqual([]);
    expect(linkCardsMutually(db, a, 404)).toEqual([]);
    expect(linksOf(a)).toEqual([b]);
    // 实际改动的卡片各记一条编辑记录，未改动与不存在的不再记
    expect(
      db
        .prepare(`SELECT operation_id, operation_action, operation_time FROM operation ORDER BY id`)
        .all()
    ).toEqual([{ operation_id: a, operation_action: "update", operation_time: 9 }]);
  });

  it("记下看过不动生成时间；重新生成后清空", () => {
    const row = KnowledgeAiInsightsTable.save(
      db,
      input([], { scope: "project", projectId: 3 }),
      null,
      100
    );
    expect(KnowledgeAiInsightsTable.markSeen(db, row.id, 200)).toBe(true);
    expect(KnowledgeAiInsightsTable.get(db, row.id)).toMatchObject({
      updateTime: 100,
      result: { seenAt: 200 },
    });
    const next = KnowledgeAiInsightsTable.save(
      db,
      input([], { scope: "project", projectId: 3 }),
      row.id,
      300
    );
    expect(next.result.seenAt).toBeUndefined();
    expect(KnowledgeAiInsightsTable.markSeen(db, 404)).toBe(false);
  });
});
