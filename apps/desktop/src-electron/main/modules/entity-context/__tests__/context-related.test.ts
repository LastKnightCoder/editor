import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import ContentAiMetaTable from "../../tables/content-ai-meta";
import QuestionLinkTable from "../../tables/question-link";
import QuestionTable from "../../tables/question";
import { ensureRelatedThreshold, relatedOf, sampleRelatedThreshold } from "../context-related";

const DIM = 8;

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("脉络「相关」", () => {
  let main: Database.Database;
  let index: Database.Database;
  const random = rng(7);

  const near = (axis: number, noise = 0.08) =>
    Array.from({ length: DIM }, (_, i) => (i === axis ? 1 : 0) + (random() - 0.5) * noise);

  const addContent = (text: string) =>
    Number(
      main
        .prepare(
          `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, ?, ?, 1)`
        )
        .run(
          JSON.stringify([{ type: "paragraph", children: [{ type: "formatted", text }] }]),
          text.length
        ).lastInsertRowid
    );
  const addVector = (key: string, vector: number[]) =>
    index
      .prepare(
        `INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding)
         VALUES (?, 1.0, '', ?, 0, vec_f32(?))`
      )
      .run(key, key.split(":")[0], JSON.stringify(vector));
  const addCard = (text: string, vector: number[]) => {
    const contentId = addContent(text);
    const id = Number(
      main
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', '[]', ?)`
        )
        .run(contentId).lastInsertRowid
    );
    addVector(`card:${id}`, vector);
    return { id, contentId };
  };
  const linkContents = (a: number, b: number) =>
    main
      .prepare(
        `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, 1)`
      )
      .run(Math.min(a, b), Math.max(a, b));

  beforeEach(() => {
    main = new Database(":memory:");
    main.exec(mainSchema);
    index = new Database(":memory:");
    sqliteVec.load(index);
    index.exec(indexSchema);
    index.exec(`CREATE VIRTUAL TABLE vec_documents USING vec0(
      prefixed_id TEXT, update_time FLOAT, content TEXT, type TEXT, chunk_index INTEGER,
      vec_embedding FLOAT[${DIM}] distance_metric=cosine)`);
    index
      .prepare(`INSERT INTO vec_index_meta (key, value, updated_at) VALUES (?, ?, 1)`)
      .run("main_content_embedding_fingerprint", "model-a");
    for (let i = 0; i < 60; i++) addCard(`噪音卡片 ${i}`, near(1 + (i % 2), 0.8));
  });
  afterEach(() => {
    main.close();
    index.close();
  });

  it("阈值取随机对 p95，存 index_meta；指纹变化后重新抽样", () => {
    const first = ensureRelatedThreshold(index)!;
    expect(first.pairs).toBeGreaterThanOrEqual(100);
    expect(first.value).toBeGreaterThan(0.3);
    expect(first.value).toBeLessThan(0.9);
    expect(ensureRelatedThreshold(index)).toEqual(first);
    index.prepare(`UPDATE vec_index_meta SET value = 'model-b'`).run();
    expect(ensureRelatedThreshold(index)?.fingerprint).toBe("model-b");
    expect(sampleRelatedThreshold(new Database(":memory:"), "x")).toBeNull();
  });

  it("排除已有关系，最多 5 条，带要点；共用正文只出一次", () => {
    const self = addCard("自身", near(0));
    const linked = addCard("双向链接", near(0));
    linkContents(self.contentId, linked.contentId);
    const backlink = addCard("引用了自身", near(0));
    index
      .prepare(
        `INSERT INTO entity_refs (src_content_id, dst_kind, dst_id, dst_content_id) VALUES (?, 'card', ?, ?)`
      )
      .run(backlink.contentId, self.id, self.contentId);
    const lineage = addCard("衍生", near(0));
    main
      .prepare(
        `INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time)
         VALUES ('card', ?, 'card', ?, 'derived', 1)`
      )
      .run(String(self.id), String(lineage.id));
    const sameQuestion = addCard("同一问题的材料", near(0));
    const questionId = QuestionTable.captureQuestion(main, "问题").question.id;
    QuestionLinkTable.linkTargets(main, questionId, [
      { targetType: "card", targetId: self.id },
      { targetType: "card", targetId: sameQuestion.id },
    ]);
    const related = Array.from({ length: 7 }, (_, i) => addCard(`相关 ${i}`, near(0)));
    // 共用正文的项目文档：同一份正文只出一次
    const doc = Number(
      main
        .prepare(
          `INSERT INTO project_item (title, create_time, update_time, content_id, ref_type) VALUES ('投影', 1, 1, ?, 'card')`
        )
        .run(related[0].contentId).lastInsertRowid
    );
    addVector(`project-item:${doc}`, near(0, 0.001));
    ContentAiMetaTable.upsert(main, {
      contentId: related[0].contentId,
      textDigest: "d",
      meta: { title: "AI 标题", summary: "一句话要点", concepts: [], claims: [] },
      model: "p/m",
    });

    const result = relatedOf(main, index, { kind: "card", id: self.id });
    expect(result).toHaveLength(5);
    const keys = result.map(item => `${item.entity.ref.kind}:${item.entity.ref.id}`);
    for (const excluded of [self, linked, backlink, lineage, sameQuestion]) {
      expect(keys).not.toContain(`card:${excluded.id}`);
    }
    expect(
      keys.filter(key => key.startsWith("project-item:")).length +
        keys.filter(key => key === `card:${related[0].id}`).length
    ).toBeLessThanOrEqual(1);
    const withSummary = result.find(item => item.summary);
    expect(withSummary).toMatchObject({ summary: "一句话要点" });
    expect(result.every(item => !("similarity" in item))).toBe(true);
  });

  it("近邻低于阈值、没有向量或不在范围内时为空", () => {
    const self = addCard("孤立", near(3));
    expect(relatedOf(main, index, { kind: "card", id: self.id })).toEqual([]);
    const noVector = Number(
      main
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', '[]', ?)`
        )
        .run(addContent("没有向量")).lastInsertRowid
    );
    expect(relatedOf(main, index, { kind: "card", id: noVector })).toEqual([]);
    expect(relatedOf(main, index, { kind: "diary-moment", id: 1 })).toEqual([]);
  });
});
