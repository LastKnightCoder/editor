// @vitest-environment node
/**
 * AI 洞见评估（15 §10 第 3 步）：真实库副本上分析若干长文与卡片，导出「位置 / 标记 / 问题」交用户逐条判断。
 *
 *   KL_INSIGHTS_EVAL_MAIN=/tmp/kl7-real.db KL_INSIGHTS_EVAL_INDEX=/tmp/kl7-index-bge.db \
 *     KL_INSIGHTS_EVAL_REBUILD=local "KL_LOCAL_MODEL_DIR=…/embedding-models" \
 *     KL_INSIGHTS_EVAL_OUT=/tmp/kl7b-insights-eval.md \
 *     npx vitest run src-electron/main/modules/__tests__/content-insights.eval.test.ts
 *
 * - 两个库都必须是副本；KL_INSIGHTS_EVAL_REBUILD 同 related.eval（缺陷向量上评估没有意义，见 14 §3.1）。
 * - 模型取 setting.json 的 contentInsights 槽，没配时回退 contentMetadata 槽（报告里写明）。
 * - 候选缺 7a 元信息时先为它们生成元信息（写进主库副本），否则候选只有片段、没有要点与主张。
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { writeFileSync } from "node:fs";
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
import type { EntityRef } from "@/entity/ref";
import { contentPlainText, textDigest } from "@/entity/text-digest";
import type { ContentInsights } from "@/types/content-insights";
import {
  CONTENT_AI_SYSTEM_PROMPT,
  buildContentAiUserPrompt,
  parseContentAiOutput,
  type ContentAiKind,
} from "../content-ai-prompt";
import { analyzeContent, findCandidates } from "../content-insights";
import { rebuildIndex, rng } from "../entity-context/__tests__/eval-index-rebuild";
import ContentAiMetaTable from "../tables/content-ai-meta";
import ContentTable from "../tables/content";
import { createEvalCompleter } from "./eval-llm";

const MAIN = process.env.KL_INSIGHTS_EVAL_MAIN;
const INDEX = process.env.KL_INSIGHTS_EVAL_INDEX;
const OUT = process.env.KL_INSIGHTS_EVAL_OUT ?? "/tmp/kl7b-insights-eval.md";
const REBUILD = process.env.KL_INSIGHTS_EVAL_REBUILD;
const DOCS = Number(process.env.KL_INSIGHTS_EVAL_DOCS ?? 10);
const CARDS = Number(process.env.KL_INSIGHTS_EVAL_CARDS ?? 10);
const CONCURRENCY = 4;
const KIND_LABEL: Record<string, string> = {
  link: "可连接",
  dup: "重复",
  conflict: "矛盾",
  gap: "可以展开",
};

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) await run(items[next++]);
    })
  );
}

it.skipIf(!MAIN || !INDEX)(
  "AI 洞见评估（真实库副本）",
  async () => {
    const llm = await createEvalCompleter(["contentInsights", "contentMetadata"]);
    expect(llm, "设置里「AI 洞见」与「笔记元信息」都还没配模型").not.toBeNull();
    const main = new Database(MAIN!);
    main.exec(mainSchema);
    const rebuilt = REBUILD ? await rebuildIndex(main, INDEX!, REBUILD) : null;
    const index = new Database(INDEX!);
    sqliteVec.load(index);

    // 样本：≥ 3 节的长文（文章、非引用型项目文档）与 ≥ 150 字的卡片，都要有向量
    const sectionsOf = new Map(
      (
        index
          .prepare(
            `SELECT prefixed_id, COUNT(*) AS n FROM vec_documents WHERE type IN ('card','article','project-item') GROUP BY prefixed_id`
          )
          .all() as Array<{ prefixed_id: string; n: number }>
      ).map(row => [row.prefixed_id, row.n])
    );
    const random = rng(20261003);
    const shuffle = <T>(list: T[]) =>
      list
        .map(item => ({ item, order: random() }))
        .sort((a, b) => a.order - b.order)
        .map(x => x.item);
    const docs = shuffle(
      (
        main
          .prepare(
            `SELECT 'article' AS kind, a.id FROM articles a JOIN contents c ON c.id = a.content_id WHERE a.is_delete = 0 AND c.count >= 1000
             UNION ALL SELECT 'project-item', p.id FROM project_item p JOIN contents c ON c.id = p.content_id
               WHERE p.project_item_type = 'document' AND (p.ref_type IS NULL OR p.ref_type = '') AND c.count >= 1000`
          )
          .all() as Array<{ kind: EntityRef["kind"]; id: number }>
      ).filter(ref => (sectionsOf.get(`${ref.kind}:${ref.id}`) ?? 0) >= 3)
    ).slice(0, DOCS);
    const cards = shuffle(
      (
        main
          .prepare(
            `SELECT 'card' AS kind, c.id FROM cards c JOIN contents ct ON ct.id = c.content_id WHERE ct.count >= 150`
          )
          .all() as Array<{ kind: EntityRef["kind"]; id: number }>
      ).filter(ref => sectionsOf.has(`card:${ref.id}`))
    ).slice(0, CARDS);
    const samples = [...docs, ...cards];

    // 候选缺元信息的先补上（与 content-ai-queue 同一提示词）
    const kindOfContent = (contentId: number): ContentAiKind => {
      const row = main
        .prepare(
          `SELECT CASE WHEN EXISTS (SELECT 1 FROM cards WHERE content_id = ?) THEN 'card'
                  WHEN EXISTS (SELECT 1 FROM articles WHERE content_id = ?) THEN 'article' ELSE 'project-item' END AS kind`
        )
        .get(contentId, contentId) as { kind: ContentAiKind };
      return row.kind;
    };
    const needMeta = new Set<number>();
    for (const ref of samples) {
      const contentId = (
        main
          .prepare(
            ref.kind === "card"
              ? `SELECT content_id AS id FROM cards WHERE id = ?`
              : ref.kind === "article"
                ? `SELECT content_id AS id FROM articles WHERE id = ?`
                : `SELECT content_id AS id FROM project_item WHERE id = ?`
          )
          .get(ref.id) as { id: number }
      ).id;
      const content = ContentTable.getContentById(main, contentId)!;
      const { candidates } = findCandidates(main, index, {
        ref,
        key: `${ref.kind}:${ref.id}`,
        contentId,
        title: "",
        content: content.content as Descendant[],
      });
      for (const candidate of candidates) {
        if (!ContentAiMetaTable.get(main, candidate.target.contentId))
          needMeta.add(candidate.target.contentId);
      }
    }
    const metaStarted = performance.now();
    const metaUsageBefore = { ...llm!.usage };
    await pool([...needMeta], async contentId => {
      const content = ContentTable.getContentById(main, contentId);
      if (!content) return;
      const kind = kindOfContent(contentId);
      const prompt = buildContentAiUserPrompt({
        kind,
        title: "",
        content: content.content as Descendant[],
      });
      if (!prompt) return;
      const result = await llm!.complete({
        providerId: "",
        modelId: "",
        system: CONTENT_AI_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });
      const meta = result.ok ? parseContentAiOutput(result.text) : null;
      if (meta) {
        ContentAiMetaTable.upsert(main, {
          contentId,
          textDigest: textDigest(contentPlainText(content.content as Descendant[])),
          meta,
          model: `${llm!.slot.providerId}/${llm!.slot.modelId}`,
        });
      }
    });
    const metaUsage = {
      calls: llm!.usage.calls - metaUsageBefore.calls,
      input: llm!.usage.input - metaUsageBefore.input,
      output: llm!.usage.output - metaUsageBefore.output,
      seconds: (performance.now() - metaStarted) / 1000,
    };

    // 分析
    const usageBefore = { ...llm!.usage };
    const results: Array<{
      ref: EntityRef;
      title: string;
      ms: number;
      insights?: ContentInsights;
      error?: string;
    }> = [];
    await pool(samples, async ref => {
      const started = performance.now();
      const picker = ref.kind === "project-item" ? "project_item" : ref.kind;
      const title =
        (
          main
            .prepare(
              picker === "card"
                ? `SELECT '' AS title`
                : `SELECT title FROM ${picker === "article" ? "articles" : "project_item"} WHERE id = ${ref.id}`
            )
            .get() as { title: string } | undefined
        )?.title ?? "";
      try {
        const insights = await analyzeContent(
          { complete: request => llm!.complete(request), now: Date.now },
          main,
          index,
          ref,
          llm!.slot
        );
        results.push({ ref, title, ms: performance.now() - started, insights });
      } catch (error) {
        results.push({ ref, title, ms: performance.now() - started, error: String(error) });
      }
      console.log(`[insights-eval] ${results.length}/${samples.length}`);
    });
    const analysisUsage = {
      calls: llm!.usage.calls - usageBefore.calls,
      input: llm!.usage.input - usageBefore.input,
      output: llm!.usage.output - usageBefore.output,
    };

    const order = new Map(samples.map((ref, i) => [`${ref.kind}:${ref.id}`, i]));
    results.sort(
      (a, b) => order.get(`${a.ref.kind}:${a.ref.id}`)! - order.get(`${b.ref.kind}:${b.ref.id}`)!
    );
    const ok = results.filter(r => r.insights);
    const markCount = ok.reduce((n, r) => n + r.insights!.result.marks.length, 0);
    const byKind: Record<string, number> = {};
    for (const r of ok)
      for (const m of r.insights!.result.marks) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
    const lines: string[] = [
      `# AI 洞见评估`,
      "",
      `- 模型：${llm!.slot.providerId} / ${llm!.slot.modelId}（槽 ${llm!.slotName}${llm!.slotName === "contentInsights" ? "" : "，「AI 洞见」未配置，回退"}）`,
      `- 向量：${rebuilt ? `重建（${REBUILD}），${rebuilt.indexed} 个实体` : "现有索引库副本"}`,
      `- 样本：长文 ${docs.length} 篇、卡片 ${cards.length} 张；成功 ${ok.length} / ${results.length}`,
      `- 标记共 ${markCount} 处（每篇平均 ${(markCount / Math.max(1, ok.length)).toFixed(1)}）：${Object.entries(
        byKind
      )
        .map(([k, n]) => `${KIND_LABEL[k]} ${n}`)
        .join("，")}`,
      `- 为候选补元信息：${metaUsage.calls} 份，输入 ${metaUsage.input} / 输出 ${metaUsage.output} token，${Math.round(metaUsage.seconds)} 秒`,
      `- 分析：${analysisUsage.calls} 次，输入 ${analysisUsage.input} / 输出 ${analysisUsage.output} token；平均每次输入 ${Math.round(analysisUsage.input / Math.max(1, analysisUsage.calls))} / 输出 ${Math.round(analysisUsage.output / Math.max(1, analysisUsage.calls))}；平均耗时 ${(results.reduce((a, r) => a + r.ms, 0) / Math.max(1, results.length) / 1000).toFixed(1)} 秒（含本地候选，并发 ${CONCURRENCY}）`,
      "",
      `请在每条标记最后一列标「有用 / 没用 / 错」（错 = 理由不成立或对方不对）。`,
      "",
    ];
    for (const r of results) {
      const content = ContentTable.getContentById(
        main,
        r.insights?.contentId ??
          (
            main.prepare(`SELECT content_id AS id FROM cards WHERE id = ?`).get(r.ref.id) as
              { id: number } | undefined
          )?.id ??
          0
      );
      const head = r.title || clip(contentPlainText((content?.content ?? []) as Descendant[]), 40);
      lines.push(`## ${cell(head)}（${r.ref.kind}:${r.ref.id}）`, "");
      if (!r.insights) {
        lines.push(`失败：${r.error}`, "");
        continue;
      }
      const { result } = r.insights;
      lines.push(
        `- 候选 ${result.candidates} 份；耗时 ${(r.ms / 1000).toFixed(1)} 秒`,
        `- **位置**：${result.lead}`,
        ""
      );
      if (result.marks.length) {
        lines.push(
          `| # | 类型 | 本文原文 | 对方 | 理由 | 判断 |`,
          `| --- | --- | --- | --- | --- | --- |`
        );
        result.marks.forEach((m, i) => {
          const target = m.target
            ? `${m.target.title}${m.target.heading ? ` › ${m.target.heading}` : ""}`
            : "—";
          const why =
            m.kind === "gap"
              ? `${m.text}：${m.why}`
              : m.mine
                ? `${m.why}（这里：${m.mine}；对方：${m.theirs}）`
                : m.why;
          lines.push(
            `| ${i + 1} | ${KIND_LABEL[m.kind]} | ${cell(m.anchor || "（段尾）")} | ${cell(clip(target, 50))} | ${cell(why)} |  |`
          );
        });
        lines.push("");
      } else lines.push("（没有标记）", "");
      if (result.asks.length)
        lines.push(`**可以继续想**：${result.asks.map(a => `「${a.text}」`).join(" ")}`, "");
    }
    writeFileSync(OUT, lines.join("\n") + "\n");
    console.log(`[insights-eval] 报告已写入 ${OUT}`);
    main.close();
    index.close();
  },
  7_200_000
);
