// @vitest-environment node
/**
 * 创作模式召集评估（18 §9 第 4 步）：真实库副本上按若干写作意图召集资料，导出分组、每份资料与理由，交用户逐条判断。
 *
 *   KL_COMPOSE_EVAL_MAIN=/tmp/compose-main.db KL_COMPOSE_EVAL_INDEX=/tmp/compose-index.db \
 *     "KL_LOCAL_MODEL_DIR=…/embedding-models" KL_COMPOSE_EVAL_OUT=/tmp/compose-gather-eval.md \
 *     npx vitest run src-electron/main/modules/__tests__/compose-gather.eval.test.ts
 *
 * - 两个库都必须是副本；索引须是本地 bge-m3（补 <s> 之后的管线）建的，查询向量用同一模型。
 * - 意图：KL_COMPOSE_EVAL_INTENTS 指向的文件（每行一条，「意图」或「文章 id<TAB>意图」）；
 *   没给时抽 KL_COMPOSE_EVAL_DOCS 篇长文，用「标题：正文开头」当意图（等同已有文章进入创作模式的预填）。
 * - 模型取 setting.json 的 contentInsights 槽，没配时回退 contentMetadata 槽（报告里写明）。
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../database", () => ({ default: {} }));
vi.mock("../pi-ai-runtime", () => ({ default: {} }));
vi.mock("../user-setting", () => ({ default: {} }));

import type { Descendant } from "slate";
import { contentPlainText } from "@/entity/text-digest";
import type { GatherResult } from "@/types/compose";
import { gather } from "../compose-gather";
import { rng } from "../entity-context/__tests__/eval-index-rebuild";
import ContentTable from "../tables/content";
import VecDocumentTable from "../tables/vec-document";
import { createEvalCompleter } from "./eval-llm";

const MAIN = process.env.KL_COMPOSE_EVAL_MAIN;
const INDEX = process.env.KL_COMPOSE_EVAL_INDEX;
const OUT = process.env.KL_COMPOSE_EVAL_OUT ?? "/tmp/compose-gather-eval.md";
const INTENTS = process.env.KL_COMPOSE_EVAL_INTENTS;
const DOCS = Number(process.env.KL_COMPOSE_EVAL_DOCS ?? 10);
const KIND_LABEL: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "diary-moment": "日记",
};

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

it.skipIf(!MAIN || !INDEX)(
  "创作模式召集评估（真实库副本）",
  async () => {
    const llm = await createEvalCompleter(["contentInsights", "contentMetadata"]);
    expect(llm, "设置里「AI 洞见」与「笔记元信息」都还没配模型").not.toBeNull();
    const main = new Database(MAIN!);
    main.exec(mainSchema);
    const index = new Database(INDEX!);
    sqliteVec.load(index);

    const modelInfo = {
      provider: "local",
      model: "bge-m3",
      dimensions: 1024,
      batchSize: 8,
      devicePolicy: "auto",
    };
    const embed = (texts: string[]) =>
      (
        VecDocumentTable as unknown as {
          createEmbeddings(texts: string[], info: unknown): Promise<number[][]>;
        }
      ).createEmbeddings(texts, modelInfo);
    // 嵌入失败时召集会静默退回只靠概念补召回，评估就没有意义
    expect((await embed(["探测"]))[0]?.length, "查询嵌入失败，检查 KL_LOCAL_MODEL_DIR").toBe(1024);

    // 样本：给定意图，或长文的「标题：正文开头」
    type Sample = { contentId: number; title: string; intent: string; source: string };
    const articleRow = main.prepare(
      `SELECT a.id, a.title, a.content_id FROM articles a WHERE a.id = ? AND a.is_delete = 0`
    );
    let samples: Sample[];
    if (INTENTS && existsSync(INTENTS)) {
      // 没指定文章的意图：建一份空正文当作新文章
      samples = readFileSync(INTENTS, "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const [maybeId, ...rest] = line.split("\t");
          const row = rest.length
            ? (articleRow.get(Number(maybeId)) as
                | { id: number; title: string; content_id: number }
                | undefined)
            : undefined;
          if (row)
            return {
              contentId: row.content_id,
              title: row.title,
              intent: rest.join("\t"),
              source: `文章 #${row.id}`,
            };
          const contentId = ContentTable.createContent(main, { content: [] });
          return { contentId, title: "", intent: line, source: "新文章" };
        });
    } else {
      const random = rng(20261009);
      const rows = main
        .prepare(
          `SELECT a.id, a.title, a.content_id FROM articles a JOIN contents c ON c.id = a.content_id
           WHERE a.is_delete = 0 AND c.count >= 800`
        )
        .all() as Array<{ id: number; title: string; content_id: number }>;
      samples = rows
        .map(row => ({ row, order: random() }))
        .sort((a, b) => a.order - b.order)
        .slice(0, DOCS)
        .map(({ row }) => {
          const content = ContentTable.getContentById(main, row.content_id);
          const head = contentPlainText((content?.content ?? []) as Descendant[])
            .replace(/\s+/g, " ")
            .slice(0, 120);
          return {
            contentId: row.content_id,
            title: row.title,
            intent: [row.title, head].filter(Boolean).join("："),
            source: `文章 #${row.id}`,
          };
        });
    }
    expect(samples.length, "没有可评估的样本").toBeGreaterThan(0);

    const results: Array<{
      sample: Sample;
      result: GatherResult | null;
      error: string;
      seconds: number;
    }> = [];
    for (const sample of samples) {
      const started = performance.now();
      try {
        const result = await gather(
          { embed, complete: request => llm!.complete(request) },
          main,
          index,
          { contentId: sample.contentId, intent: sample.intent, exclude: [] },
          llm!.slot
        );
        results.push({ sample, result, error: "", seconds: (performance.now() - started) / 1000 });
      } catch (error) {
        results.push({
          sample,
          result: null,
          error: error instanceof Error ? error.message : String(error),
          seconds: (performance.now() - started) / 1000,
        });
      }
      console.log(`[compose-eval] ${results.length} / ${samples.length}`);
    }

    const ok = results.filter(item => item.result);
    const picked = ok.reduce(
      (sum, item) => sum + item.result!.groups.reduce((n, group) => n + group.items.length, 0),
      0
    );
    const lines = [
      "# 创作模式召集评估",
      "",
      `模型：${llm!.slot.providerId}/${llm!.slot.modelId}（槽 ${llm!.slotName}）；样本 ${samples.length}，成功 ${ok.length}。`,
      `用量：${llm!.usage.calls} 次调用，输入 ${llm!.usage.input.toLocaleString()} / 输出 ${llm!.usage.output.toLocaleString()} token；平均每次 ${(
        results.reduce((sum, item) => sum + item.seconds, 0) / results.length
      ).toFixed(1)} 秒，平均摆上 ${(picked / Math.max(1, ok.length)).toFixed(1)} 份。`,
      "",
      "每份请标：有用 / 没用 / 错（理由不对）。",
      "",
    ];
    for (const { sample, result, error, seconds } of results) {
      lines.push(`## ${sample.title || "（新文章）"}`, "");
      lines.push(`- 来源：${sample.source} · ${seconds.toFixed(1)} 秒`);
      lines.push(`- 意图：${cell(sample.intent)}`);
      if (!result) {
        lines.push(`- 失败：${error}`, "");
        continue;
      }
      lines.push(`- 本地候选 ${result.candidates} 份`, "");
      if (!result.groups.length) {
        lines.push("（没有摆上任何资料）", "");
        continue;
      }
      lines.push("| 组 | 类型 | 资料 | 命中节 | 为什么相关 | 判断 |", "| - | - | - | - | - | - |");
      for (const group of result.groups) {
        for (const item of group.items) {
          lines.push(
            `| ${cell(group.name)} | ${KIND_LABEL[item.ref.kind] ?? item.ref.kind} | ${cell(item.title)} | ${cell(item.heading)} | ${cell(item.why)} |  |`
          );
        }
      }
      lines.push("");
    }
    writeFileSync(OUT, lines.join("\n"), "utf8");
    console.log(`[compose-eval] 写入 ${OUT}`);
    main.close();
    index.close();
  },
  60 * 60 * 1000
);
