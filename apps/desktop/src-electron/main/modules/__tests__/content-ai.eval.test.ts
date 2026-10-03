// @vitest-environment node
/**
 * 笔记元信息评估（13 §11.2）：在真实库副本上抽 100 张卡片、20 篇长文生成元信息，导出抽查表与 token 用量。
 *
 *   cp ~/.editor/data.db /tmp/kl7-eval.db   # 连同 -wal（若有）
 *   KL_CONTENT_AI_EVAL_MAIN=/tmp/kl7-eval.db KL_CONTENT_AI_EVAL_OUT=/tmp/kl7-content-ai-eval.md \
 *     npx vitest run src-electron/main/modules/__tests__/content-ai.eval.test.ts
 *
 * 模型读当前设置（默认 ~/.editor/setting.json，可用 KL_SETTING 指定）里的 contentMetadata 槽；槽没配就失败退出。
 * 只写副本的 content_ai_meta，不碰正在使用的库。
 */

import Database from "better-sqlite3";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeContext } from "@earendil-works/pi-ai";
import { expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import type { Descendant } from "slate";
import { contentPlainText, textDigest } from "@/entity/text-digest";
import {
  CONTENT_AI_SYSTEM_PROMPT,
  buildContentAiUserPrompt,
  parseContentAiOutput,
  titleDisplayLength,
  type ContentAiKind,
} from "../content-ai-prompt";
import { CONTENT_AI_SLOT } from "../content-ai-queue";
import { resolveUsageSlot } from "../llm-usage-slot";
import {
  buildSingleShotContext,
  createProviderRegistry,
  resolveV2Providers,
} from "../pi-ai-runtime-core";
import ContentAiMetaTable from "../tables/content-ai-meta";

vi.mock("../database", () => ({ default: {} }));
vi.mock("../pi-ai-runtime", () => ({ default: {} }));
vi.mock("../user-setting", () => ({ default: {} }));

const MAIN = process.env.KL_CONTENT_AI_EVAL_MAIN;
const OUT = process.env.KL_CONTENT_AI_EVAL_OUT ?? "/tmp/kl7-content-ai-eval.md";
const SETTING_PATH = process.env.KL_SETTING ?? join(homedir(), ".editor", "setting.json");
const CARD_SAMPLES = Number(process.env.KL_CONTENT_AI_EVAL_CARDS ?? 100);
const DOC_SAMPLES = Number(process.env.KL_CONTENT_AI_EVAL_DOCS ?? 20);
const LONG_DOC_MIN_CHARS = 1000;
const CONCURRENCY = 4;
/** 推算全库用量的重度口径（KL-029）：2 万张卡 + 3000 篇长文 */
const HEAVY_CARDS = 20_000;
const HEAVY_DOCS = 3_000;

interface Sample {
  contentId: number;
  kind: ContentAiKind;
  title: string;
  content: Descendant[];
  text: string;
}

interface Result extends Sample {
  ok: boolean;
  error?: string;
  aiTitle: string;
  summary: string;
  concepts: string[];
  claims: string[];
  input: number;
  output: number;
  ms: number;
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadSamples(db: Database.Database): { cards: Sample[]; docs: Sample[] } {
  const parse = (raw: string | null) => {
    try {
      return JSON.parse(raw ?? "[]") as Descendant[];
    } catch {
      return [];
    }
  };
  const cards = (
    db
      .prepare(
        `SELECT ct.id, ct.content FROM cards c JOIN contents ct ON ct.id = c.content_id WHERE ct.count > 0`
      )
      .all() as Array<{ id: number; content: string }>
  ).map<Sample>(row => {
    const content = parse(row.content);
    return { contentId: row.id, kind: "card", title: "", content, text: contentPlainText(content) };
  });
  const docs = (
    db
      .prepare(
        `SELECT ct.id, ct.content, a.title, 'article' AS kind FROM articles a JOIN contents ct ON ct.id = a.content_id
           WHERE a.is_delete = 0 AND ct.count >= ${LONG_DOC_MIN_CHARS}
         UNION ALL
         SELECT ct.id, ct.content, p.title, 'project-item' FROM project_item p JOIN contents ct ON ct.id = p.content_id
           WHERE p.project_item_type = 'document' AND (p.ref_type IS NULL OR p.ref_type = '')
             AND ct.count >= ${LONG_DOC_MIN_CHARS}`
      )
      .all() as Array<{ id: number; content: string; title: string; kind: ContentAiKind }>
  ).map<Sample>(row => {
    const content = parse(row.content);
    return {
      contentId: row.id,
      kind: row.kind,
      title: row.title,
      content,
      text: contentPlainText(content),
    };
  });
  const random = rng(20261003);
  const pick = (list: Sample[], n: number) =>
    list
      .filter(sample => sample.text.trim())
      .map(sample => ({ sample, key: random() }))
      .sort((a, b) => a.key - b.key)
      .slice(0, n)
      .map(item => item.sample);
  const cardIds = new Set<number>();
  const pickedCards = pick(cards, CARD_SAMPLES).filter(
    s => !cardIds.has(s.contentId) && cardIds.add(s.contentId)
  );
  return {
    cards: pickedCards,
    docs: pick(docs, DOC_SAMPLES).filter(s => !cardIds.has(s.contentId)),
  };
}

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

it.skipIf(!MAIN)(
  "笔记元信息评估（真实库副本）",
  async () => {
    const setting = JSON.parse(readFileSync(SETTING_PATH, "utf8"));
    const slot = resolveUsageSlot(setting, CONTENT_AI_SLOT);
    expect(slot, `设置里还没给「笔记元信息」（${CONTENT_AI_SLOT}）配模型`).not.toBeNull();
    const registry = createProviderRegistry();
    await registry.syncProviders(resolveV2Providers(setting));
    const model = registry.resolveModel(slot!.providerId, slot!.modelId);
    expect(model, "模型未注册").toBeTruthy();

    const db = new Database(MAIN!);
    db.exec(mainSchema);
    const { cards, docs } = loadSamples(db);

    const run = async (sample: Sample): Promise<Result> => {
      const prompt = buildContentAiUserPrompt(sample)!;
      const started = performance.now();
      const base = {
        ...sample,
        aiTitle: "",
        summary: "",
        concepts: [],
        claims: [],
        input: 0,
        output: 0,
      };
      try {
        const context = buildSingleShotContext(
          {
            requestId: "",
            providerId: slot!.providerId,
            modelId: slot!.modelId,
            system: CONTENT_AI_SYSTEM_PROMPT,
            messages: [{ role: "user", content: prompt }],
          },
          slot!.providerId,
          slot!.modelId
        );
        let message = null as null | {
          content: Array<{ type: string; text?: string }>;
          usage?: { input: number; output: number };
        };
        let error = "";
        for await (const event of registry.models.streamSimple(
          model!,
          normalizeContext(context),
          {}
        )) {
          if (event.type === "done") message = event.message as never;
          if (event.type === "error") error = event.error.errorMessage ?? "模型请求失败";
        }
        const text =
          message?.content
            .filter(b => b.type === "text")
            .map(b => b.text)
            .join("\n\n") ?? "";
        const meta = error ? null : parseContentAiOutput(text);
        const usage = { input: message?.usage?.input ?? 0, output: message?.usage?.output ?? 0 };
        if (!meta)
          return {
            ...base,
            ...usage,
            ok: false,
            error: error || `无法解析：${clip(text, 80)}`,
            ms: performance.now() - started,
          };
        ContentAiMetaTable.upsert(db, {
          contentId: sample.contentId,
          textDigest: textDigest(sample.text),
          meta,
          model: `${slot!.providerId}/${slot!.modelId}`,
        });
        return {
          ...base,
          ...usage,
          ok: true,
          aiTitle: meta.title,
          summary: meta.summary,
          concepts: meta.concepts,
          claims: meta.claims,
          ms: performance.now() - started,
        };
      } catch (error) {
        return { ...base, ok: false, error: String(error), ms: performance.now() - started };
      }
    };

    const all = [...cards, ...docs];
    const results: Result[] = new Array(all.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < all.length) {
          const index = next++;
          results[index] = await run(all[index]);
          console.log(
            `[content-ai-eval] ${index + 1}/${all.length} ${results[index].ok ? "ok" : results[index].error}`
          );
        }
      })
    );
    db.close();

    const cardResults = results.filter(r => r.kind === "card");
    const docResults = results.filter(r => r.kind !== "card");
    const sum = (list: Result[], key: "input" | "output") => list.reduce((a, r) => a + r[key], 0);
    const avg = (list: Result[], key: "input" | "output") =>
      list.length ? sum(list, key) / list.length : 0;
    const titleLengths = cardResults.filter(r => r.ok).map(r => titleDisplayLength(r.aiTitle));
    const lines: string[] = [];
    lines.push(`# 笔记元信息评估`, "");
    lines.push(`- 模型：${slot!.providerId} / ${slot!.modelId}`);
    lines.push(
      `- 样本：卡片 ${cardResults.length} 张，长文（≥ ${LONG_DOC_MIN_CHARS} 字的文章与项目文档）${docResults.length} 篇；成功 ${results.filter(r => r.ok).length} / ${results.length}`
    );
    lines.push(
      `- 卡片标题长度（按显示宽度）：中位 ${titleLengths.sort((a, b) => a - b)[Math.floor(titleLengths.length / 2)] ?? 0} 字，最长 ${Math.max(0, ...titleLengths)} 字，超过 24 字 ${titleLengths.filter(n => n > 24).length} 个`
    );
    lines.push(
      `- token：卡片平均输入 ${Math.round(avg(cardResults, "input"))} / 输出 ${Math.round(avg(cardResults, "output"))}；长文平均输入 ${Math.round(avg(docResults, "input"))} / 输出 ${Math.round(avg(docResults, "output"))}；本次合计输入 ${sum(results, "input")} / 输出 ${sum(results, "output")}`
    );
    lines.push(
      `- 按重度口径（${HEAVY_CARDS} 张卡 + ${HEAVY_DOCS} 篇长文）推算首轮：输入约 ${Math.round((avg(cardResults, "input") * HEAVY_CARDS + avg(docResults, "input") * HEAVY_DOCS) / 10_000)} 万、输出约 ${Math.round((avg(cardResults, "output") * HEAVY_CARDS + avg(docResults, "output") * HEAVY_DOCS) / 10_000)} 万 token`
    );
    lines.push(
      `- 平均耗时 ${Math.round(results.reduce((a, r) => a + r.ms, 0) / Math.max(1, results.length))} ms / 份（并发 ${CONCURRENCY}）`,
      ""
    );
    lines.push(`## 卡片（请标「更好 / 持平 / 更差」：AI 标题对比原文开头）`, "");
    lines.push(`| # | 原文开头 | AI 标题 | 要点 | 判断 |`, `| --- | --- | --- | --- | --- |`);
    cardResults.forEach((r, i) =>
      lines.push(
        `| ${i + 1} | ${cell(clip(r.text, 60))} | ${cell(r.ok ? r.aiTitle : `（失败：${r.error}）`)} | ${cell(r.summary)} |  |`
      )
    );
    lines.push("", `## 长文（标题由用户写，只看要点与概念）`, "");
    lines.push(`| # | 标题 | 开头 | 要点 | 概念 | 主张 |`, `| --- | --- | --- | --- | --- | --- |`);
    docResults.forEach((r, i) =>
      lines.push(
        `| ${i + 1} | ${cell(r.title)} | ${cell(clip(r.text, 50))} | ${cell(r.ok ? r.summary : `（失败：${r.error}）`)} | ${cell(r.concepts.join("、"))} | ${cell(r.claims.join("；"))} |`
      )
    );
    writeFileSync(OUT, lines.join("\n") + "\n");
    console.log(`[content-ai-eval] 报告已写入 ${OUT}`);
  },
  3_600_000
);
