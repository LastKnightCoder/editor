import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { EntityRef } from "@/entity/ref";
import type { KnowledgeMark } from "@/types/knowledge-insights";
import { createPatternCard, discardPatternCard } from "../pattern-card";
import CardTable from "../tables/card";
import EntityLineageTable from "../tables/entity-lineage";
import { emptyResult } from "../tables/knowledge-ai-insights";
import KnowledgeAiInsightsTable from "../tables/knowledge-ai-insights";

vi.mock("@/utils/markdown.ts", () => ({ getMarkdown: vi.fn(() => "") }));
vi.mock("../tables/fts", () => ({ default: { removeIndexByIdAndType: vi.fn() } }));
vi.mock("../tables/vec-document", () => ({ default: { removeIndexByIdAndType: vi.fn() } }));
vi.mock("../tables/project", () => ({ default: {} }));

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(schema);
});
afterEach(() => db.close());

const end = (ref: EntityRef) => ({
  ref,
  contentId: ref.id,
  title: `${ref.kind} ${ref.id}`,
  topic: "前端 › 像素",
  heading: "",
  block: 0,
  excerpt: "",
});

const card = (links: number[] = []) =>
  CardTable.createCard(db, {
    content: [{ type: "paragraph", children: [{ type: "formatted", text: "已有" }] }] as never,
    count: 2,
    tags: [],
    links,
    isTop: false,
  }).id;

function savePattern(ends: EntityRef[], extra: Partial<KnowledgeMark> = {}) {
  const mark: KnowledgeMark = {
    id: "p1",
    kind: "pattern",
    why: "都反复用了物理像素与 CSS 像素相差 dpr 倍",
    text: "用 dpr 桥接物理像素与 CSS 像素",
    ends: ends.map(end),
    status: "open",
    ...extra,
  };
  return KnowledgeAiInsightsTable.save(db, {
    scope: "subtopic",
    parentId: null,
    projectId: null,
    label: "像素",
    members: [],
    overview: { overview: "", shift: "" },
    result: { ...emptyResult(), marks: [mark] },
    increments: 0,
    model: "m",
  }).id;
}

const linksOf = (id: number) => CardTable.getCardById(db, id)?.links ?? null;
const statusOf = (nodeId: number) =>
  KnowledgeAiInsightsTable.get(db, nodeId)!.result.marks[0].status;
const card$ = (id: number) => ({ kind: "card", id }) as const;

describe("同一思路写成卡片", () => {
  it("新建空卡片：卡片端互相链接，长文端记谱系，标记记为已连接", () => {
    const a = card();
    const b = card();
    const nodeId = savePattern([card$(a), card$(b), { kind: "article", id: 7 }]);

    const { card: created, changed } = createPatternCard(db, nodeId, "p1");
    expect(created.content).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
    expect(created.links.sort()).toEqual([a, b].sort());
    expect(linksOf(a)).toEqual([created.id]);
    expect(linksOf(b)).toEqual([created.id]);
    expect(changed.sort()).toEqual([a, b].sort());
    expect(EntityLineageTable.sourcesOf(db, [card$(created.id)])).toMatchObject([
      { node: { kind: "article", id: 7 }, relation: "distilled_from" },
    ]);
    expect(statusOf(nodeId)).toBe("linked");

    // 已处理过的不能再建一张
    expect(() => createPatternCard(db, nodeId, "p1")).toThrow();
  });

  it("不是同一思路的标记不建卡片", () => {
    const nodeId = savePattern([card$(card())], { kind: "dup" });
    expect(() => createPatternCard(db, nodeId, "p1")).toThrow();
    expect(CardTable.getAllCards(db)).toHaveLength(1);
  });

  it("撤回还空着的卡片：解开链接、删谱系与卡片，标记回到未处理", () => {
    const a = card([]);
    const nodeId = savePattern([card$(a), { kind: "project-item", id: 3 }]);
    const { card: created } = createPatternCard(db, nodeId, "p1");

    const result = discardPatternCard(db, nodeId, "p1", created.id);
    expect(result?.card.id).toBe(created.id);
    expect(result?.changed).toEqual([a]);
    expect(CardTable.getCardById(db, created.id)).toBeFalsy();
    expect(linksOf(a)).toEqual([]);
    expect(EntityLineageTable.derivedOf(db, [{ kind: "project-item", id: 3 }])).toEqual([]);
    expect(statusOf(nodeId)).toBe("open");
  });

  it("已经写了内容的卡片不撤回", () => {
    const a = card();
    const nodeId = savePattern([card$(a)]);
    const { card: created } = createPatternCard(db, nodeId, "p1");
    db.prepare(`UPDATE contents SET content = ? WHERE id = ?`).run(
      JSON.stringify([{ type: "paragraph", children: [{ type: "formatted", text: "我的话" }] }]),
      created.contentId
    );

    expect(discardPatternCard(db, nodeId, "p1", created.id)).toBeNull();
    expect(CardTable.getCardById(db, created.id)).toBeTruthy();
    expect(linksOf(a)).toEqual([created.id]);
    expect(statusOf(nodeId)).toBe("linked");
  });
});
