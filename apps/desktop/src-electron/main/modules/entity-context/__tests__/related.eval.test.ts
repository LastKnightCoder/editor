// @vitest-environment node
/**
 * 脉络「相关」评估（13 §11.2）：真实库副本 + 索引库副本，只读。
 *
 *   cp ~/.editor/data.db /tmp/kl7-real.db; cp ~/.editor/index/data/data.index.db /tmp/kl7-index.db
 *   KL_RELATED_EVAL_MAIN=/tmp/kl7-real.db KL_RELATED_EVAL_INDEX=/tmp/kl7-index.db \
 *     KL_RELATED_EVAL_OUT=/tmp/kl7-related-eval.md \
 *     npx vitest run src-electron/main/modules/entity-context/__tests__/related.eval.test.ts
 *
 * - 召回：藏起 20% 的正文显式连接（content_links；从排除集合里拿掉对方的身份与正文），看对方是否出现在「相关」前 5 条（另报前 50 近邻与过阈值的比例）；
 * - 抽查：随机 20 个有向量的实体，列出「相关」给用户判断是否值得看；
 * - 阈值：随机对 p95 与分布；查询耗时。
 * 两个库都必须是副本：WAL 模式的副本只读打不开，阈值也会写进索引库副本的 index_meta。
 *
 * 重建向量再测（KL_RELATED_EVAL_REBUILD）：在 KL_RELATED_EVAL_INDEX 指定的路径新建索引库，
 * 按主内容向量队列的口径（splitSections + VecDocumentTable.indexContent）为卡片、文章、项目文档重新嵌入：
 *   - `local`：本地 bge-m3（当前分支的补 <s> + 分窗管线），模型目录用 KL_LOCAL_MODEL_DIR；
 *   - 其他值：setting.json 里该 id 的远端嵌入配置（按量计费）。
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => process.env.KL_LOCAL_USER_DATA ?? "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import { entityRefKey, type EntityRef } from "@/entity/ref";
import { rebuildIndex, rng } from "./eval-index-rebuild";
import ContentLinkTable from "../../tables/content-link";
import EntitySearchTable from "../../tables/entity-search";
import KnowledgeMapTable from "../../tables/knowledge-map";
import {
  NEIGHBOR_K,
  RELATED_LIMIT,
  ensureRelatedThreshold,
  relatedExclusions,
  relatedOf,
} from "../context-related";

const MAIN = process.env.KL_RELATED_EVAL_MAIN;
const INDEX = process.env.KL_RELATED_EVAL_INDEX;
const OUT = process.env.KL_RELATED_EVAL_OUT ?? "/tmp/kl7-related-eval.md";
const SPOT_CHECKS = 20;
const REBUILD = process.env.KL_RELATED_EVAL_REBUILD;

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

it.skipIf(!MAIN || !INDEX)(
  "「相关」召回与抽查（真实库副本）",
  async () => {
    const main = new Database(MAIN!);
    // 副本可能早于本分支，补齐新表（含 content_ai_meta）
    main.exec(mainSchema);
    const rebuilt = REBUILD ? await rebuildIndex(main, INDEX!, REBUILD) : null;
    if (rebuilt) console.log("[related-eval] 重建完成", rebuilt);
    // 阈值会写进索引库副本的 index_meta
    const memory = new Database(INDEX!);
    sqliteVec.load(memory);

    const thresholdStarted = performance.now();
    const threshold = ensureRelatedThreshold(memory);
    const thresholdMs = performance.now() - thresholdStarted;
    expect(threshold, "没有向量或样本不足").not.toBeNull();

    const hasVectors = new Set(
      (
        memory
          .prepare(
            `SELECT DISTINCT prefixed_id FROM vec_documents WHERE type IN ('card','article','project-item')`
          )
          .all() as Array<{ prefixed_id: string }>
      ).map(row => row.prefixed_id)
    );

    // 召回：正文显式连接（content_links，边无向、一行一条），两端各取一个有向量的身份，随机藏 20%
    const random = rng(20261003);
    const edges = ContentLinkTable.allEdges(main);
    const identities = EntitySearchTable.locateAll(
      main,
      edges.flatMap(edge => [edge.contentId, edge.targetContentId])
    );
    const withVector = (contentId: number) =>
      (identities.get(contentId) ?? []).filter(ref => hasVectors.has(entityRefKey(ref)));
    const pairs = edges.filter(
      edge => withVector(edge.contentId).length && withVector(edge.targetContentId).length
    );
    const hidden = pairs.filter(() => random() < 0.2);
    let inTop5 = 0;
    let inNeighbors = 0;
    let aboveThreshold = 0;
    const misses: string[] = [];
    for (const { contentId, targetContentId } of hidden) {
      const ref = withVector(contentId)[0];
      const targets = new Set(withVector(targetContentId).map(entityRefKey));
      const exclusions = relatedExclusions(main, memory, identities.get(contentId) ?? [ref], [
        contentId,
      ]);
      // 藏起这条连接：与 relatedExclusions 同口径，同时去掉对方的身份与正文
      for (const other of identities.get(targetContentId) ?? [])
        exclusions.keys.delete(entityRefKey(other));
      exclusions.contents.delete(targetContentId);
      const neighbors = KnowledgeMapTable.neighborsOf(memory, entityRefKey(ref), NEIGHBOR_K);
      const found = neighbors.find(neighbor => targets.has(neighbor.key));
      if (found) inNeighbors++;
      if (found && found.similarity > threshold!.value) aboveThreshold++;
      // 与 relatedOf 同口径：过阈值、按身份与正文排除、同一正文只取一次
      const top: number[] = [];
      for (const neighbor of neighbors) {
        if (top.length >= RELATED_LIMIT || neighbor.similarity <= threshold!.value) break;
        if (exclusions.keys.has(neighbor.key)) continue;
        const [kind, id] = neighbor.key.split(":");
        const located = ContentLinkTable.canonicalContentIdOf(main, {
          kind,
          id: Number(id),
        } as EntityRef);
        if (located == null || exclusions.contents.has(located) || top.includes(located)) continue;
        top.push(located);
      }
      if (top.includes(targetContentId)) inTop5++;
      else if (misses.length < 10)
        misses.push(
          `${entityRefKey(ref)} → ${[...targets].join(" / ")}（近邻相似度 ${found?.similarity.toFixed(3) ?? `不在前 ${NEIGHBOR_K}`}）`
        );
    }

    // 抽查与耗时：随机 20 个有向量的实体
    const keys = [...hasVectors].sort();
    const chosen = keys
      .map(key => ({ key, order: random() }))
      .sort((x, y) => x.order - y.order)
      .slice(0, SPOT_CHECKS)
      .map(item => item.key);
    const times: number[] = [];
    const lines: string[] = [];
    const counts: number[] = [];
    for (const key of chosen) {
      const [kind, id] = key.split(":");
      const ref = { kind, id: Number(id) } as EntityRef;
      const started = performance.now();
      const related = relatedOf(main, memory, ref);
      times.push(performance.now() - started);
      counts.push(related.length);
      const picker = kind === "project-item" ? "project_item" : kind;
      const self = EntitySearchTable.resolve(main, picker as "card", ref.id, 0);
      lines.push(`### ${cell(self?.title ?? key)}（${key}）`, "");
      if (!related.length) lines.push("（无）", "");
      else {
        lines.push(`| # | 相关 | 要点 | 值得看？ |`, `| --- | --- | --- | --- |`);
        related.forEach((item, i) =>
          lines.push(
            `| ${i + 1} | ${cell(item.entity.title)}（${item.entity.ref.kind}） | ${cell(item.summary)} |  |`
          )
        );
        lines.push("");
      }
    }
    // 另外量全部有向量的卡片（最多 300 个）的查询耗时
    const timingKeys = keys.filter(key => key.startsWith("card:")).slice(0, 300);
    const allTimes: number[] = [];
    for (const key of timingKeys) {
      const started = performance.now();
      relatedOf(main, memory, { kind: "card", id: Number(key.split(":")[1]) });
      allTimes.push(performance.now() - started);
    }
    allTimes.sort((x, y) => x - y);

    const report = [
      `# 脉络「相关」评估`,
      "",
      rebuilt
        ? `- 向量：重建（${REBUILD}），${rebuilt.indexed} 个实体成功、${rebuilt.failed} 个失败，${rebuilt.dimensions} 维，用时 ${Math.round(rebuilt.seconds)} 秒`
        : `- 向量：现有索引库副本`,
      `- 有向量的实体 ${hasVectors.size} 个；阈值（随机对 p${Math.round(0.95 * 100)}）${threshold!.value.toFixed(3)}，样本 ${threshold!.pairs} 对，抽样 ${Math.round(thresholdMs)} ms`,
      `- 召回：两端都有向量的显式连接 ${pairs.length} 对（共 ${edges.length} 条），藏起 ${hidden.length} 对；在前 ${NEIGHBOR_K} 近邻 ${inNeighbors}（${((inNeighbors / Math.max(1, hidden.length)) * 100).toFixed(1)}%），近邻里高于阈值 ${aboveThreshold}（${((aboveThreshold / Math.max(1, hidden.length)) * 100).toFixed(1)}%），**进入「相关」前 ${RELATED_LIMIT} 条 ${inTop5}（${((inTop5 / Math.max(1, hidden.length)) * 100).toFixed(1)}%）**`,
      `- 抽查 ${SPOT_CHECKS} 个实体：「相关」条数分布 ${counts.join(" / ")}`,
      `- 查询耗时（${allTimes.length} 张卡）：平均 ${(allTimes.reduce((a, b) => a + b, 0) / Math.max(1, allTimes.length)).toFixed(1)} ms，p95 ${percentile(allTimes, 0.95).toFixed(1)} ms，最大 ${(allTimes[allTimes.length - 1] ?? 0).toFixed(1)} ms`,
      "",
      `## 未找回的样例（最多 10 条）`,
      "",
      ...misses.map(miss => `- ${miss}`),
      "",
      `## 抽查（请在「值得看？」列标 是 / 否）`,
      "",
      ...lines,
    ];
    writeFileSync(OUT, report.join("\n") + "\n");
    console.log(`[related-eval] 报告已写入 ${OUT}`);
    main.close();
    memory.close();
  },
  7_200_000
);
