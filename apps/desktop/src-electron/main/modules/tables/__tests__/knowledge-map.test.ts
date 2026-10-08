/**
 * 知识地图表的 IO：主库与索引库都用真实的 main.sql / index.sql 产物建表，读写一轮验证契约。
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeMap } from "@/knowledge-map/types";
import { reindexContents } from "../../entity-context/ref-indexer";
import KnowledgeMapTable, { KNOWLEDGE_MAP_FINGERPRINT_KEY } from "../knowledge-map";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");
const INDEX_SQL = readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8");

let mainDb: Database.Database;
let indexDb: Database.Database;
let clock = 1_000;

const text = (t: string) => ({ type: "formatted", text: t });
const p = (...children: unknown[]) => ({ type: "paragraph", children });
const link = (contentType: string, refId: number, contentId?: number) => ({
  type: "content-link",
  contentType,
  refId,
  contentId,
  contentTitle: "x",
  children: [text("x")],
});

const content = (nodes: unknown[] = [p(text("正文"))], count = 2, updateTime = clock++) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, ?, 1)`
      )
      .run(updateTime, updateTime, JSON.stringify(nodes), count).lastInsertRowid
  );
const card = (contentId: number, tags: string[] = [], updateTime = clock) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (?, ?, ?, '[]', ?)`
      )
      .run(updateTime, updateTime, JSON.stringify(tags), contentId).lastInsertRowid
  );
/** 两份正文之间建显式连接（content_links 无向边） */
const linkContents = (a: number, b: number) =>
  mainDb
    .prepare(
      `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
    )
    .run(Math.min(a, b), Math.max(a, b), clock++);
const article = (contentId: number, tags: string[] = [], isDelete = 0) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id, is_delete)
         VALUES (?, ?, '文', '', ?, '[]', ?, ?)`
      )
      .run(clock, clock, JSON.stringify(tags), contentId, isDelete).lastInsertRowid
  );
const project = (title: string) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO project (create_time, update_time, title, children) VALUES (?, ?, ?, '[]')`
      )
      .run(clock, clock, title).lastInsertRowid
  );
const item = (
  contentId: number,
  options: {
    title?: string;
    projectId?: number;
    parent?: number;
    tags?: string[];
    type?: string;
    refType?: string;
  } = {}
) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO project_item (create_time, update_time, title, content_id, children, parents, projects, project_item_type, ref_type, tags)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`
      )
      .run(
        clock,
        clock,
        options.title ?? "文档",
        contentId,
        JSON.stringify(options.parent ? [options.parent] : []),
        JSON.stringify(options.projectId ? [options.projectId] : []),
        options.type ?? "document",
        options.refType ?? null,
        JSON.stringify(options.tags ?? [])
      ).lastInsertRowid
  );

beforeEach(() => {
  mainDb = new Database(":memory:");
  mainDb.exec(MAIN_SQL);
  indexDb = new Database(":memory:");
  indexDb.exec(INDEX_SQL);
});

afterEach(() => {
  mainDb.close();
  indexDb.close();
});

const sample: KnowledgeMap = {
  computedAt: 1234,
  nodes: [
    { key: "article:2", x: 10, y: 20, topic: 1, subtopic: -1 },
    { key: "card:1", x: 1.5, y: -2, topic: 0, subtopic: 2 },
  ],
  topics: [
    { id: 0, parent: -1, label: "JavaScript", colorSlot: 3, size: 1 },
    { id: 1, parent: -1, label: "CSS", colorSlot: 5, size: 1 },
    { id: 2, parent: 0, label: "Symbol", colorSlot: 3, size: 1 },
  ],
};
const sortedNodes = (map: KnowledgeMap) => [...map.nodes].sort((a, b) => (a.key < b.key ? -1 : 1));

describe("KnowledgeMapTable：读写", () => {
  it("没算过时 load 返回 null", () => {
    expect(KnowledgeMapTable.load(indexDb)).toBeNull();
  });

  it("save 后 load 原样读回，并记下指纹；save 是整体替换", () => {
    KnowledgeMapTable.save(indexDb, sample, "fp-1");
    const loaded = KnowledgeMapTable.load(indexDb)!;
    expect(loaded.computedAt).toBe(1234);
    expect(sortedNodes(loaded)).toEqual(sample.nodes);
    expect(loaded.topics).toEqual(sample.topics);
    expect(KnowledgeMapTable.storedFingerprint(indexDb)).toBe("fp-1");

    KnowledgeMapTable.save(
      indexDb,
      {
        computedAt: 99,
        nodes: [{ key: "card:7", x: 0, y: 0, topic: 0, subtopic: -1 }],
        topics: [sample.topics[0]],
      },
      "fp-2"
    );
    expect(KnowledgeMapTable.load(indexDb)!.nodes.map(n => n.key)).toEqual(["card:7"]);
  });

  it("upsertNode 新增与覆盖，removeNode 删除", () => {
    KnowledgeMapTable.save(indexDb, sample, "fp");
    KnowledgeMapTable.upsertNode(indexDb, {
      key: "project-item:3",
      x: 5,
      y: 5,
      topic: 0,
      subtopic: -1,
    });
    KnowledgeMapTable.upsertNode(indexDb, { key: "card:1", x: 9, y: 9, topic: 1, subtopic: -1 });
    KnowledgeMapTable.removeNode(indexDb, "article:2");
    const byKey = new Map(KnowledgeMapTable.load(indexDb)!.nodes.map(n => [n.key, n]));
    expect([...byKey.keys()].sort()).toEqual(["card:1", "project-item:3"]);
    expect(byKey.get("card:1")).toMatchObject({ x: 9, topic: 1 });
  });

  it("没有向量表时 hasVectors 为 false、neighborsOf 为空，不抛错", () => {
    expect(KnowledgeMapTable.hasVectors(indexDb, "card:1")).toBe(false);
    expect(KnowledgeMapTable.neighborsOf(indexDb, "card:1", 8)).toEqual([]);
  });

  it("readFingerprint 读 embedding 指纹，与地图自己的指纹分开存", () => {
    indexDb
      .prepare("INSERT INTO vec_index_meta (key, value, updated_at) VALUES (?, ?, 0)")
      .run("main_content_embedding_fingerprint", "model-a");
    expect(KnowledgeMapTable.readFingerprint(indexDb)).toBe("model-a");
    expect(KNOWLEDGE_MAP_FINGERPRINT_KEY).not.toBe("main_content_embedding_fingerprint");
  });
});

describe("KnowledgeMapTable.listEntities：节点范围与命名", () => {
  it("卡片、未删文章、非引用型且有正文的项目文档；共用正文只出一个节点", () => {
    const shared = content();
    const cardId = card(shared, ["JavaScript/Symbol"]);
    const pid = project("前端体系");
    item(shared, { projectId: pid, refType: "card" }); // 引用型：不出
    const articleId = article(content(), ["渲染"]);
    article(content(), [], 1); // 软删：不出
    const docId = item(content(), { projectId: pid, title: "浏览器" });
    item(content([], 0), { projectId: pid }); // 空正文：不出
    item(content(), { projectId: pid, type: "white-board" }); // 非文档：不出
    const keys = KnowledgeMapTable.listEntities(mainDb).map(e => e.key);
    expect(keys).toEqual([`article:${articleId}`, `card:${cardId}`, `project-item:${docId}`]);
  });

  it("项目文档有 tag 用 tag，没有则用「项目名 / 顶层文档」", () => {
    const pid = project("前端体系");
    const root = item(content(), { projectId: pid, title: "渲染" });
    const child = item(content(), { projectId: pid, title: "重排", parent: root });
    const grandchild = item(content(), { projectId: pid, title: "细节", parent: child });
    const tagged = item(content(), { projectId: pid, tags: ["自己的标签"] });
    const tags = new Map(KnowledgeMapTable.listEntities(mainDb).map(e => [e.key, e.tags]));
    expect(tags.get(`project-item:${root}`)).toEqual(["前端体系/渲染"]);
    expect(tags.get(`project-item:${child}`)).toEqual(["前端体系/渲染"]);
    expect(tags.get(`project-item:${grandchild}`)).toEqual(["前端体系/渲染"]);
    expect(tags.get(`project-item:${tagged}`)).toEqual(["自己的标签"]);
  });

  it("driftCount 数重算之后增量放置的与编辑过的节点（含只改了正文的），按键去重", () => {
    const computedAt = 10_000;
    KnowledgeMapTable.save(indexDb, { ...sample, computedAt }, "fp");
    card(content(undefined, 2, computedAt - 500), [], computedAt - 500); // 都没动
    card(content(undefined, 2, computedAt + 10), [], computedAt - 500); // 只改了正文
    const fresh = card(content(undefined, 2, computedAt + 20), [], computedAt + 20); // 新建且已放置
    KnowledgeMapTable.upsertNode(indexDb, {
      key: `card:${fresh}`,
      x: 0,
      y: 0,
      topic: 0,
      subtopic: -1,
    });
    const entities = KnowledgeMapTable.listEntities(mainDb);
    expect(KnowledgeMapTable.driftCount(entities, indexDb, computedAt)).toBe(2);
  });
});

describe("KnowledgeMapTable.readInputs", () => {
  it("显式连接与跨类型的内联引用都成为边；下标按键排序，坏 JSON 不抛错", () => {
    const targetContent = content();
    const target = card(targetContent, ["甲"]);
    const other = card(content(), []);
    const linkingContent = content();
    const linking = card(linkingContent, ["乙"]);
    linkContents(linkingContent, targetContent);
    const articleContent = content([p(link("card", target, targetContent))]);
    const articleId = article(articleContent);
    const pid = project("项目");
    const docContent = content([p(link("article", articleId))]);
    const docId = item(docContent, { projectId: pid });
    mainDb.prepare("UPDATE cards SET tags = 'broken' WHERE id = ?").run(other);
    reindexContents(mainDb, indexDb, [articleContent, docContent]);

    const { nodes, chunks } = KnowledgeMapTable.readInputs(mainDb, indexDb);
    const byKey = new Map(nodes.map(n => [n.key, n]));
    const index = (key: string) => byKey.get(key)!.id;
    expect(nodes.map(n => n.id)).toEqual(nodes.map((_, i) => i));
    expect(byKey.get(`card:${linking}`)!.links).toEqual([index(`card:${target}`)]);
    expect(byKey.get(`article:${articleId}`)!.links).toEqual([index(`card:${target}`)]);
    expect(byKey.get(`project-item:${docId}`)!.links).toEqual([index(`article:${articleId}`)]);
    expect(byKey.get(`card:${other}`)!.tags).toEqual([]);
    // 没有 vec_documents 表（未配置 embedding）时不抛错、没有向量
    expect(chunks).toEqual([]);
  });

  it("项目文档连到最近的、在地图上的祖先，跨过空文档", () => {
    const pid = project("Docker");
    const root = item(content(), { projectId: pid, title: "Docker" });
    const empty = item(content([], 0), { projectId: pid, title: "空章节", parent: root });
    const leaf = item(content(), { projectId: pid, title: "镜像", parent: empty });
    const child = item(content(), { projectId: pid, title: "容器", parent: root });
    const { nodes } = KnowledgeMapTable.readInputs(mainDb, indexDb);
    const byKey = new Map(nodes.map(n => [n.key, n]));
    const rootIndex = byKey.get(`project-item:${root}`)!.id;
    expect(byKey.has(`project-item:${empty}`)).toBe(false);
    expect(byKey.get(`project-item:${leaf}`)!.links).toEqual([rootIndex]);
    expect(byKey.get(`project-item:${child}`)!.links).toEqual([rootIndex]);
    expect(byKey.get(`project-item:${root}`)!.links).toEqual([]);
  });
});
