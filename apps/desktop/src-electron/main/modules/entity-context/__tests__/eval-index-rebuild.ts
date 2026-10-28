/**
 * 评估脚本共用：在新索引库路径上按主内容向量队列的口径（splitSections + VecDocumentTable.indexContent）
 * 为卡片、文章、项目文档重新嵌入。目前只支持 `local`（本地 bge-m3，模型目录 KL_LOCAL_MODEL_DIR）。
 * 只给 *.eval.test.ts 用。调用方的测试文件要 mock electron（app.getPath）与 video-note-index-queue。
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { rmSync } from "node:fs";
import { expect } from "vitest";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";
import { mainEmbeddingFingerprint } from "@/entity/chunk-version";
import { splitSections } from "@/entity/sections";
import type { IndexType } from "@/types";
import { getMarkdown } from "@/utils/markdown";
import { LOCAL_EMBEDDING_PIPELINE } from "../../../utils/embedding-config";
import ArticleTable from "../../tables/article";
import CardTable from "../../tables/card";
import ProjectTable from "../../tables/project";
import VecDocumentTable from "../../tables/vec-document";
import { listChatPromptDocs } from "../../chat-prompt-index";

export async function rebuildIndex(
  main: Database.Database,
  path: string,
  mode: string,
  options: { withChatPrompts?: boolean } = {}
) {
  rmSync(path, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
  const db = new Database(path);
  sqliteVec.load(db);
  db.exec(indexSchema);
  if (mode !== "local") {
    throw new Error(`远端嵌入配置已下线，仅支持 local 模式：${mode}`);
  }
  const modelInfo: Parameters<typeof VecDocumentTable.indexContent>[1]["modelInfo"] = {
    provider: "local",
    model: "bge-m3",
    dimensions: 1024,
    batchSize: 8,
    devicePolicy: "auto",
  };
  // 只用于阈值按指纹缓存：与应用里的指纹格式无关
  const fingerprint = mainEmbeddingFingerprint(
    JSON.stringify({ model: "bge-m3", pipeline: LOCAL_EMBEDDING_PIPELINE })
  );
  const tasks: Array<{
    id: number;
    type: IndexType;
    content: unknown[];
    title: string;
    whole: boolean;
    updateTime: number;
  }> = [];
  for (const card of CardTable.getAllCards(main))
    tasks.push({
      id: card.id,
      type: "card",
      content: card.content || [],
      title: "",
      whole: true,
      updateTime: Number(card.update_time),
    });
  for (const article of ArticleTable.getAllArticles(main))
    tasks.push({
      id: article.id,
      type: "article",
      content: article.content || [],
      title: article.title || "",
      whole: false,
      updateTime: Number(article.update_time),
    });
  for (const item of ProjectTable.getAllProjectItems(main))
    tasks.push({
      id: item.id,
      type: "project-item",
      content: item.content || [],
      title: item.title || "",
      whole: false,
      updateTime: Number(item.updateTime),
    });
  // 主对话的提问（7c「问了但没写」）：会话目录按主库文件名取，副本要命名成和原库同名（如 data.db）
  const prompts = options.withChatPrompts ? listChatPromptDocs(main) : [];
  const started = performance.now();
  let indexed = 0;
  let failed = 0;
  let dimensions = 0;
  for (const task of tasks) {
    const markdown = getMarkdown(task.content as never).trim();
    if (!markdown) continue;
    const sections = splitSections(task.content as never, task.title, task.whole);
    if (!dimensions) {
      // createEmbeddings 是私有方法：先嵌入一次探出维度再建表
      const probe = await (
        VecDocumentTable as unknown as {
          createEmbeddings(texts: string[], info: unknown): Promise<number[][]>;
        }
      ).createEmbeddings([sections[0]?.embeddingText ?? markdown], modelInfo as never);
      dimensions = probe[0]?.length ?? 0;
      expect(dimensions, "嵌入维度为 0").toBeGreaterThan(0);
      VecDocumentTable.initTableByVecLength(db, dimensions);
    }
    const ok = await VecDocumentTable.indexContent(db, {
      id: task.id,
      type: task.type,
      content: markdown,
      title: task.title || undefined,
      sections,
      updateTime: task.updateTime,
      modelInfo,
    } as never);
    if (ok) indexed++;
    else failed++;
    if ((indexed + failed) % 100 === 0)
      console.log(`[eval-rebuild] 重建 ${indexed + failed} / ${tasks.length}`);
  }
  for (const prompt of prompts) {
    const ok = await VecDocumentTable.indexContent(db, { ...prompt, modelInfo } as never);
    if (ok) indexed++;
    else failed++;
    if ((indexed + failed) % 100 === 0)
      console.log(`[eval-rebuild] 重建 ${indexed + failed} / ${tasks.length + prompts.length}`);
  }
  db.prepare(
    `INSERT INTO vec_index_meta (key, value, updated_at) VALUES ('main_content_embedding_fingerprint', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(fingerprint, Date.now());
  db.close();
  return {
    indexed,
    failed,
    dimensions,
    prompts: prompts.length,
    seconds: (performance.now() - started) / 1000,
  };
}

/** 确定性随机数：同一副本多次评估结果可对照 */
export function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
