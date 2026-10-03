// @vitest-environment node
/**
 * 7b 阅读时标记的数据评估（设计用，不对应运行时代码）：在真实库副本上按「节 → 其他内容」取近邻，
 * 统计不同阈值与上限下每篇会出几处标记，并导出抽查表交用户判断「这处标记值不值得出现」。
 *
 *   KL_MARKS_EVAL_MAIN=/tmp/kl7-real.db KL_MARKS_EVAL_INDEX=/tmp/kl7-index-bge.db \
 *     KL_MARKS_EVAL_REBUILD=local "KL_LOCAL_MODEL_DIR=…/embedding-models" \
 *     KL_MARKS_EVAL_OUT=/tmp/kl7b-marks-eval.md \
 *     npx vitest run src-electron/main/modules/entity-context/__tests__/reading-marks.eval.test.ts
 *
 * 两个库都必须是副本；KL_MARKS_EVAL_REBUILD 同 related.eval（缺陷向量上评估没有意义，见 14 §3.1）。
 * 候选口径：每节的向量查 k = 200 块近邻，按实体取最高相似度，排除自身、共用正文与已有关系（同「相关」），
 * 同一目标只留在相似度最高的那一节；阈值取随机块对的分位数。
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../database", () => ({ default: {} }));
vi.mock("../../pi-ai-runtime", () => ({ default: {} }));
vi.mock("../../user-setting", () => ({ default: {} }));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import EntitySearchTable from "../../tables/entity-search";
import { relatedExclusions } from "../context-related";
import { proseOf } from "../../content-insights";
import { rebuildIndex, rng } from "./eval-index-rebuild";

const MAIN = process.env.KL_MARKS_EVAL_MAIN;
const INDEX = process.env.KL_MARKS_EVAL_INDEX;
const OUT = process.env.KL_MARKS_EVAL_OUT ?? "/tmp/kl7b-marks-eval.md";
const REBUILD = process.env.KL_MARKS_EVAL_REBUILD;
const KNN_CHUNKS = 200;
const QUANTILES = [0.95, 0.98, 0.99, 0.995];
const CAPS = [1, 3, 5];
const SAMPLE_DOCS = 12;
const SAMPLE_CARDS = 10;
const TYPES = "'card','article','project-item'";
/** KL_MARKS_FILTER=1：只在文字足够的节上出标记（去掉代码、图片、链接后不少于 MIN_PROSE 字），目标同理 */
const FILTER = process.env.KL_MARKS_FILTER === "1";
const MIN_PROSE = 80;
/** KL_MARKS_SAME_PROJECT=1：同一项目里的文档互不标记（项目树本身就是用户搭的结构） */
const SKIP_SAME_PROJECT = process.env.KL_MARKS_SAME_PROJECT === "1";

interface Mark {
  section: number;
  heading: string;
  sectionText: string;
  target: string;
  targetHeading: string;
  similarity: number;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};
const toFloats = (blob: Buffer) =>
  new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
const cosine = (a: Float32Array, b: Float32Array) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

it.skipIf(!MAIN || !INDEX)(
  "阅读时标记候选统计（真实库副本）",
  async () => {
    const main = new Database(MAIN!);
    main.exec(mainSchema);
    const rebuilt = REBUILD ? await rebuildIndex(main, INDEX!, REBUILD) : null;
    if (rebuilt) console.log("[marks-eval] 重建完成", rebuilt);
    const index = new Database(INDEX!);
    sqliteVec.load(index);

    // 随机块对的分位数（5000 对）
    const chunks = index
      .prepare(`SELECT rowid, prefixed_id, chunk_index FROM vec_documents WHERE type IN (${TYPES})`)
      .all() as Array<{ rowid: number; prefixed_id: string; chunk_index: number }>;
    const vectorOf = index.prepare(`SELECT vec_embedding FROM vec_documents WHERE rowid = ?`);
    const random = rng(7);
    const sims: number[] = [];
    while (sims.length < 5000) {
      const a = chunks[Math.floor(random() * chunks.length)];
      const b = chunks[Math.floor(random() * chunks.length)];
      if (a.prefixed_id === b.prefixed_id) continue;
      sims.push(
        cosine(
          toFloats((vectorOf.get(a.rowid) as { vec_embedding: Buffer }).vec_embedding),
          toFloats((vectorOf.get(b.rowid) as { vec_embedding: Buffer }).vec_embedding)
        )
      );
    }
    sims.sort((x, y) => x - y);
    const thresholds = QUANTILES.map(q => ({ q, value: sims[Math.floor(sims.length * q)] }));

    const proseLength = new Map<string, number>();
    const proseOfChunk = (key: string, chunk: number) => {
      const id = `${key}#${chunk}`;
      if (!proseLength.has(id)) {
        const row = sectionInfo.get(key, chunk) as { text: string } | undefined;
        proseLength.set(id, proseOf(row?.text ?? "").length);
      }
      return proseLength.get(id)!;
    };
    const sectionInfo = index.prepare(
      `SELECT heading_path, text FROM content_sections WHERE prefixed_id = ? AND chunk_index = ?
       ORDER BY update_time DESC LIMIT 1`
    );
    const knn = index.prepare(
      `SELECT prefixed_id, chunk_index, distance FROM vec_documents
       WHERE vec_embedding MATCH ? AND k = ? AND type IN (${TYPES})`
    );
    const contentIdOf = (ref: EntityRef) => {
      const sql =
        ref.kind === "card"
          ? `SELECT content_id AS id FROM cards WHERE id = ?`
          : ref.kind === "article"
            ? `SELECT content_id AS id FROM articles WHERE id = ? AND is_delete = 0`
            : `SELECT content_id AS id FROM project_item WHERE id = ?`;
      return (main.prepare(sql).get(ref.id) as { id: number | null } | undefined)?.id ?? null;
    };
    const parseKey = (key: string): EntityRef | null => {
      const [kind, id] = key.split(":");
      const normalized = normalizeEntityRefKind(kind);
      return normalized ? { kind: normalized, id: Number(id) } : null;
    };
    const titleOf = (key: string) => {
      const ref = parseKey(key);
      if (!ref) return key;
      const picker = ref.kind === "project-item" ? "project_item" : ref.kind;
      return EntitySearchTable.resolve(main, picker as "card", ref.id, 0)?.title ?? key;
    };

    /** 一个实体的全部候选标记（未截断、阈值取最低一档），同一目标只留最高的一节 */
    const projectOf = new Map<string, number>(
      (
        main.prepare(`SELECT id, projects FROM project_item`).all() as Array<{
          id: number;
          projects: string | null;
        }>
      ).map(row => {
        let first = 0;
        try {
          first = Number(JSON.parse(row.projects ?? "[]")[0]) || 0;
        } catch {
          first = 0;
        }
        return [`project-item:${row.id}`, first] as const;
      })
    );
    const candidatesOf = (key: string): Mark[] => {
      const ref = parseKey(key)!;
      const ownProject = projectOf.get(key) ?? 0;
      const selfContent = contentIdOf(ref);
      if (selfContent == null) return [];
      const identities = EntitySearchTable.locateAll(main, [selfContent]).get(selfContent) ?? [ref];
      const exclusions = relatedExclusions(main, index, identities, [selfContent]);
      const own = index
        .prepare(
          `SELECT chunk_index, vec_embedding FROM vec_documents WHERE prefixed_id = ? ORDER BY chunk_index`
        )
        .all(key) as Array<{ chunk_index: number; vec_embedding: Buffer }>;
      const best = new Map<string, Mark>();
      for (const chunk of own) {
        if (FILTER && proseOfChunk(key, chunk.chunk_index) < MIN_PROSE) continue;
        const rows = knn.all(chunk.vec_embedding, KNN_CHUNKS) as Array<{
          prefixed_id: string;
          chunk_index: number;
          distance: number;
        }>;
        const info = sectionInfo.get(key, chunk.chunk_index) as
          { heading_path: string; text: string } | undefined;
        for (const row of rows) {
          const similarity = 1 - row.distance;
          if (similarity < thresholds[0].value) break;
          if (row.prefixed_id === key || exclusions.keys.has(row.prefixed_id)) continue;
          const target = parseKey(row.prefixed_id);
          const targetContent = target ? contentIdOf(target) : null;
          if (targetContent == null || exclusions.contents.has(targetContent)) continue;
          if (FILTER && proseOfChunk(row.prefixed_id, row.chunk_index) < MIN_PROSE) continue;
          if (SKIP_SAME_PROJECT && ownProject && projectOf.get(row.prefixed_id) === ownProject)
            continue;
          const previous = best.get(row.prefixed_id);
          if (previous && previous.similarity >= similarity) continue;
          const targetInfo = sectionInfo.get(row.prefixed_id, row.chunk_index) as
            { heading_path: string } | undefined;
          best.set(row.prefixed_id, {
            section: chunk.chunk_index,
            heading: info?.heading_path ?? "",
            sectionText: info?.text ?? "",
            target: row.prefixed_id,
            targetHeading: targetInfo?.heading_path ?? "",
            similarity,
          });
        }
      }
      return [...best.values()].sort((a, b) => b.similarity - a.similarity);
    };

    const sectionCount = new Map(
      (
        index
          .prepare(
            `SELECT prefixed_id, COUNT(*) AS n FROM vec_documents WHERE type IN (${TYPES}) GROUP BY prefixed_id`
          )
          .all() as Array<{ prefixed_id: string; n: number }>
      ).map(row => [row.prefixed_id, row.n])
    );
    const longDocs = [...sectionCount]
      .filter(([key, n]) => !key.startsWith("card:") && n >= 3)
      .map(([key]) => key);
    const cards = [...sectionCount].filter(([key]) => key.startsWith("card:")).map(([key]) => key);

    const started = performance.now();
    const docMarks = new Map(longDocs.map(key => [key, candidatesOf(key)]));
    const docMs = (performance.now() - started) / Math.max(1, longDocs.length);
    const cardSample = cards
      .map(key => ({ key, order: random() }))
      .sort((a, b) => a.order - b.order)
      .slice(0, 200)
      .map(item => item.key);
    const cardMarks = new Map(cardSample.map(key => [key, candidatesOf(key)]));

    const lines: string[] = [
      `# 7b 阅读时标记：候选统计${FILTER ? `（过滤：节与目标的文字 ≥ ${MIN_PROSE} 字）` : "（未过滤）"}${SKIP_SAME_PROJECT ? "（同一项目互不标记）" : ""}`,
      "",
      `- 向量：${rebuilt ? `重建（${REBUILD}），${rebuilt.indexed} 个实体，${Math.round(rebuilt.seconds)} 秒` : "现有索引库副本"}`,
      `- 长文（≥ 3 节的文章与项目文档）${longDocs.length} 篇，平均 ${(longDocs.reduce((a, k) => a + (sectionCount.get(k) ?? 0), 0) / Math.max(1, longDocs.length)).toFixed(1)} 节；卡片抽 ${cardSample.length} 张`,
      `- 随机块对相似度分位：${thresholds.map(t => `p${(t.q * 100).toFixed(1)} = ${t.value.toFixed(3)}`).join("，")}`,
      `- 每篇长文取候选平均 ${docMs.toFixed(1)} ms（每节一次 KNN）`,
      "",
      `## 每篇会出几处标记（同一目标只算一次）`,
      "",
      `| 阈值 | 长文：有标记的比例 | 长文：每篇处数中位 / p90（不截断） | 卡片：有标记的比例 |`,
      `| --- | --- | --- | --- |`,
    ];
    const pct = (n: number, d: number) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
    for (const { q, value } of thresholds) {
      const counts = longDocs
        .map(key => docMarks.get(key)!.filter(m => m.similarity > value).length)
        .sort((a, b) => a - b);
      const cardHit = cardSample.filter(key =>
        cardMarks.get(key)!.some(m => m.similarity > value)
      ).length;
      lines.push(
        `| p${(q * 100).toFixed(1)}（${value.toFixed(3)}） | ${pct(counts.filter(n => n > 0).length, counts.length)} | ${counts[Math.floor(counts.length / 2)] ?? 0} / ${counts[Math.floor(counts.length * 0.9)] ?? 0} | ${pct(cardHit, cardSample.length)} |`
      );
    }
    lines.push(
      "",
      `## 截断后每篇长文的处数（按阈值 × 上限）`,
      "",
      `| 阈值 | ${CAPS.map(c => `上限 ${c}：平均处数`).join(" | ")} |`,
      `| --- | ${CAPS.map(() => "---").join(" | ")} |`
    );
    for (const { q, value } of thresholds) {
      const cells = CAPS.map(cap => {
        const total = longDocs.reduce(
          (a, key) =>
            a + Math.min(cap, docMarks.get(key)!.filter(m => m.similarity > value).length),
          0
        );
        return (total / Math.max(1, longDocs.length)).toFixed(2);
      });
      lines.push(`| p${(q * 100).toFixed(1)} | ${cells.join(" | ")} |`);
    }

    // 抽查：p99、每篇最多 3 处；长文 12 篇、卡片 10 张
    const sampleThreshold = thresholds.find(t => t.q === 0.99)!.value;
    const pickSample = (keys: string[], n: number) =>
      keys
        .map(key => ({ key, order: random() }))
        .sort((a, b) => a.order - b.order)
        .slice(0, n)
        .map(item => item.key);
    const renderSample = (key: string, marks: Mark[]) => {
      const shown = marks.filter(m => m.similarity > sampleThreshold).slice(0, 3);
      lines.push(`### ${cell(titleOf(key))}（${key}，${sectionCount.get(key)} 节）`, "");
      if (!shown.length) {
        lines.push("（无标记）", "");
        return;
      }
      lines.push(
        `| # | 出现在哪一节 | 指向 | 相似度 | 值得出现？ |`,
        `| --- | --- | --- | --- | --- |`
      );
      shown.forEach((mark, i) =>
        lines.push(
          `| ${i + 1} | ${cell(mark.heading || clip(mark.sectionText, 30))} | ${cell(clip(titleOf(mark.target), 40))}${mark.targetHeading ? ` › ${cell(mark.targetHeading)}` : ""} | ${mark.similarity.toFixed(3)} |  |`
        )
      );
      lines.push("");
    };
    lines.push(
      "",
      `## 抽查：阈值 p99（${sampleThreshold.toFixed(3)}），每篇最多 3 处（请在最后一列标 是 / 否）`,
      "",
      `### 长文`,
      ""
    );
    for (const key of pickSample(longDocs, SAMPLE_DOCS)) renderSample(key, docMarks.get(key)!);
    lines.push(`### 卡片（整张一节）`, "");
    for (const key of pickSample(cardSample, SAMPLE_CARDS)) renderSample(key, cardMarks.get(key)!);

    writeFileSync(OUT, lines.join("\n") + "\n");
    console.log(`[marks-eval] 报告已写入 ${OUT}`);
    expect(longDocs.length).toBeGreaterThan(0);
    main.close();
    index.close();
  },
  7_200_000
);
