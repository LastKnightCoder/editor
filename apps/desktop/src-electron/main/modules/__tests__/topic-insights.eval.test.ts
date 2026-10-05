// @vitest-environment node
/**
 * 主题与全局层 AI 洞见评估（17 §9 第 5 步）：真实库副本上跑完整的分层阅读与几个项目回顾，导出报告交用户抽查。
 *
 *   cp ~/.editor/data.db /tmp/kl7c/data.db        # 副本必须叫 data.db：提问从同名库的会话目录读（只读）
 *   KL_TOPIC_EVAL_MAIN=/tmp/kl7c/data.db KL_TOPIC_EVAL_INDEX=/tmp/kl7c/index.db \
 *     KL_TOPIC_EVAL_REBUILD=local "KL_LOCAL_MODEL_DIR=…/embedding-models" \
 *     KL_TOPIC_EVAL_REFS=/tmp/kl7c/real-index.db KL_TOPIC_EVAL_OUT=/tmp/kl7c-topic-eval.md \
 *     npx vitest run src-electron/main/modules/__tests__/topic-insights.eval.test.ts
 *
 * - 两个库都必须是副本：重建向量（含主对话提问）、重算地图、为地图上缺元信息的笔记补元信息，都写在副本里。
 * - 模型取 setting.json 的 contentInsights 槽，没配时回退 contentMetadata 槽（报告里写明）。
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
vi.mock("../knowledge-map-builder", () => ({ default: {} }));

import type { Descendant } from "slate";
import { computeKnowledgeMap } from "@/knowledge-map/compute";
import { meanPool } from "@/knowledge-map/vectors";
import { contentPlainText, textDigest } from "@/entity/text-digest";
import type { KnowledgeMark } from "@/types/knowledge-insights";
import {
  CONTENT_AI_SYSTEM_PROMPT,
  buildContentAiUserPrompt,
  parseContentAiOutput,
  type ContentAiKind,
} from "../content-ai-prompt";
import { rebuildIndex } from "../entity-context/__tests__/eval-index-rebuild";
import { projectTree, reviewProject } from "../project-review";
import ContentAiMetaTable from "../tables/content-ai-meta";
import ContentTable from "../tables/content";
import KnowledgeAiInsightsTable from "../tables/knowledge-ai-insights";
import KnowledgeMapTable from "../tables/knowledge-map";
import { analyzeKnowledge, buildContext, metaCoverage } from "../topic-insights";
import {
  ASKED_GROUP_MARGIN,
  ASKED_NEAR_MARGIN,
  NOTE_TYPES_SQL,
  askedCandidates,
} from "../topic-insights-candidates";
import { createEvalCompleter } from "./eval-llm";

const MAIN = process.env.KL_TOPIC_EVAL_MAIN;
const INDEX = process.env.KL_TOPIC_EVAL_INDEX;
const OUT = process.env.KL_TOPIC_EVAL_OUT ?? "/tmp/kl7c-topic-eval.md";
const REBUILD = process.env.KL_TOPIC_EVAL_REBUILD;
/** 真实索引库的副本：取引用索引（entity_refs） */
const REFS = process.env.KL_TOPIC_EVAL_REFS;
const GROWING = Number(process.env.KL_TOPIC_EVAL_GROWING ?? 3);
const ARCHIVED = Number(process.env.KL_TOPIC_EVAL_ARCHIVED ?? 2);
const CONCURRENCY = 4;
const KIND_LABEL: Record<string, string> = {
  bridge: "呼应",
  asked: "问了没写",
  dup: "重复",
  conflict: "矛盾",
  chain: "缺一环",
  pattern: "同一思路",
  gap: "还缺",
  belong: "可能属于这里",
  thin: "还薄",
};

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) await run(items[next++]);
    })
  );
}

function describe(mark: KnowledgeMark): string {
  const ends = mark.ends.map(
    end =>
      `${end.topic ? `「${end.topic}」` : ""}《${end.title}》${end.anchor ? `〔${end.anchor}〕` : ""}`
  );
  switch (mark.kind) {
    case "chain": {
      const parts = [...ends];
      if (mark.missing) parts.splice(mark.missing.index, 0, `？${mark.missing.text}`);
      return parts.join(" → ");
    }
    case "pattern":
      return `${mark.text ?? ""}：${ends.join("、")}`;
    case "asked":
      return `${mark.text ?? ""}（${mark.prompts?.length ?? 0} 次：${(mark.prompts ?? [])
        .map(prompt => `「${prompt.text.slice(0, 40)}」`)
        .join(" ")}）`;
    case "gap":
    case "thin":
      return mark.text ?? "";
    case "bridge":
      return `${ends.join(" ↔ ")}｜共同的道理：${mark.text ?? ""}`;
    default:
      return ends.join(" ↔ ") + (mark.claims ? `（${mark.claims.join(" / ")}）` : "");
  }
}

it.skipIf(!MAIN || !INDEX)(
  "主题与全局层洞见评估（真实库副本）",
  async () => {
    const llm = await createEvalCompleter(["contentInsights", "contentMetadata"]);
    expect(llm, "设置里「AI 洞见」与「笔记元信息」都还没配模型").not.toBeNull();
    const main = new Database(MAIN!);
    main.exec(mainSchema);
    const rebuilt = REBUILD
      ? await rebuildIndex(main, INDEX!, REBUILD, { withChatPrompts: true })
      : null;
    const index = new Database(INDEX!);
    sqliteVec.load(index);
    // 重建的索引库只有向量：引用索引从真实索引库的副本搬过来，地图与「已连接」才完整
    if (REFS) {
      index.prepare(`ATTACH DATABASE ? AS src`).run(REFS);
      // 真实索引库可能是旧版结构（本分支加过列）：按两边共有的列搬
      const columns = (table: string) =>
        (index.prepare(`PRAGMA ${table}`).all() as Array<{ name: string }>).map(row => row.name);
      const theirs = new Set(columns("src.table_info(entity_refs)"));
      const shared = columns("main.table_info(entity_refs)").filter(name => theirs.has(name));
      const list = shared.join(", ");
      index.exec(
        `DELETE FROM entity_refs; INSERT INTO entity_refs (${list}) SELECT ${list} FROM src.entity_refs;`
      );
      index.exec(`DETACH DATABASE src`);
    }

    // 重算地图（缺陷向量上算出的主题不可信）
    const mapStarted = performance.now();
    const inputs = KnowledgeMapTable.readInputs(main, index);
    const vectors = meanPool(
      new Map(inputs.chunks.map(([id, buffers]) => [id, buffers.map(b => new Float32Array(b))]))
    );
    const map = computeKnowledgeMap(inputs.nodes, vectors);
    KnowledgeMapTable.save(index, map, KnowledgeMapTable.readFingerprint(index));
    const mapSeconds = (performance.now() - mapStarted) / 1000;

    // 地图上缺元信息的先补上（与 content-ai-queue 同一提示词）
    const entities = KnowledgeMapTable.listEntities(main);
    const onMap = new Set(map.nodes.filter(node => node.topic >= 0).map(node => node.key));
    const needMeta = entities.filter(
      entity =>
        onMap.has(entity.key) && entity.contentId && !ContentAiMetaTable.get(main, entity.contentId)
    );
    const metaStarted = performance.now();
    const metaBefore = { ...llm!.usage };
    await pool(needMeta, async entity => {
      const content = ContentTable.getContentById(main, entity.contentId);
      if (!content) return;
      const prompt = buildContentAiUserPrompt({
        kind: entity.kind as ContentAiKind,
        title: entity.title,
        content: content.content as Descendant[],
      });
      if (!prompt) return;
      const result = await llm!.complete({
        providerId: "",
        modelId: "",
        system: CONTENT_AI_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        thinking: "off",
      });
      const meta = result.ok ? parseContentAiOutput(result.text) : null;
      if (meta) {
        ContentAiMetaTable.upsert(main, {
          contentId: entity.contentId,
          textDigest: textDigest(contentPlainText(content.content as Descendant[])),
          meta,
          model: `${llm!.slot.providerId}/${llm!.slot.modelId}`,
        });
      }
    });
    const metaUsage = {
      notes: needMeta.length,
      input: llm!.usage.input - metaBefore.input,
      output: llm!.usage.output - metaBefore.output,
      seconds: (performance.now() - metaStarted) / 1000,
    };

    const deps = { complete: llm!.complete, now: () => Date.now() };
    let ctx = buildContext(main, index, map);

    // 问了没写的校准：提问离最近笔记的相似度分布
    const threshold = ctx.threshold ?? 0;
    const prompts = index
      .prepare(
        `SELECT prefixed_id, vec_embedding FROM vec_documents WHERE type = 'chat-prompt' AND chunk_index = 0`
      )
      .all() as Array<{ prefixed_id: string; vec_embedding: Buffer }>;
    const knn = index.prepare(
      `SELECT distance FROM vec_documents WHERE vec_embedding MATCH ? AND k = 1 AND type IN (${NOTE_TYPES_SQL})`
    );
    const nearest = prompts
      .map(
        row => 1 - ((knn.get(row.vec_embedding) as { distance: number } | undefined)?.distance ?? 1)
      )
      .sort((a, b) => a - b);
    const pct = (p: number) =>
      nearest.length ? nearest[Math.floor((nearest.length - 1) * p)].toFixed(3) : "-";
    const groups = await askedCandidates(index, threshold);

    // 分层阅读
    const usageBefore = { ...llm!.usage };
    const started = performance.now();
    const phases: string[] = [];
    const outcome = await analyzeKnowledge(deps, ctx, llm!.slot, {
      force: true,
      onPhase: phase => phases.push(JSON.stringify(phase)),
    });
    const analysis = {
      calls: llm!.usage.calls - usageBefore.calls,
      input: llm!.usage.input - usageBefore.input,
      output: llm!.usage.output - usageBefore.output,
      seconds: (performance.now() - started) / 1000,
    };

    // 项目回顾：文档最多的几个进行中项目 + 几个已归档项目
    ctx = buildContext(main, index, map);
    const projects = (
      main
        .prepare(`SELECT id, title, COALESCE(archived, 0) AS archived FROM project`)
        .all() as Array<{
        id: number;
        title: string;
        archived: number;
      }>
    )
      .map(project => ({ ...project, docs: projectTree(main, project.id)?.items.length ?? 0 }))
      .filter(project => project.docs >= 3)
      .sort((a, b) => b.docs - a.docs);
    const reviewed = [
      ...projects.filter(project => !project.archived).slice(0, GROWING),
      ...projects.filter(project => project.archived).slice(0, ARCHIVED),
    ];
    const reviewBefore = { ...llm!.usage };
    for (const project of reviewed) await reviewProject(deps, ctx, project.id, llm!.slot);
    const reviewUsage = {
      input: llm!.usage.input - reviewBefore.input,
      output: llm!.usage.output - reviewBefore.output,
    };

    // 报告
    const rows = KnowledgeAiInsightsTable.list(main);
    const lines: string[] = [
      "# 7c 主题与全局层洞见评估",
      "",
      `模型：${llm!.slot.providerId}/${llm!.slot.modelId}（槽 ${llm!.slotName}）`,
      rebuilt
        ? `向量重建：${rebuilt.indexed} 条（其中提问 ${rebuilt.prompts}），失败 ${rebuilt.failed}，${rebuilt.seconds.toFixed(0)} 秒`
        : "向量：未重建",
      `地图：${map.topics.filter(t => t.parent === -1).length} 主题 / ${map.topics.filter(t => t.parent !== -1).length} 子主题 / ${map.nodes.length} 节点，${mapSeconds.toFixed(1)} 秒`,
      `补元信息：${metaUsage.notes} 份，输入 ${metaUsage.input} / 输出 ${metaUsage.output} token，${metaUsage.seconds.toFixed(0)} 秒；覆盖率 ${(metaCoverage(ctx) * 100).toFixed(1)}%`,
      `分层阅读：子主题 ${outcome.subtopics}、主题 ${outcome.topics}、全局 ${outcome.global ? 1 : 0}，失败 ${outcome.failures}；${analysis.calls} 次调用，输入 ${analysis.input} / 输出 ${analysis.output} token，${analysis.seconds.toFixed(0)} 秒`,
      `项目回顾：${reviewed.length} 个，输入 ${reviewUsage.input} / 输出 ${reviewUsage.output} token`,
      `随机块对 p95：${threshold.toFixed(3)}；提问 ${prompts.length} 条离最近笔记的相似度 p10 ${pct(0.1)} / p50 ${pct(0.5)} / p90 ${pct(0.9)}；低于 p95+${ASKED_NEAR_MARGIN} 的成组（组内 ≥ p95+${ASKED_GROUP_MARGIN}）得 ${groups.length} 组，最大 ${groups[0]?.times ?? 0} 次`,
      "",
      "每一条请标「有用 / 没用 / 错」。",
      "",
    ];
    const markTable = (marks: KnowledgeMark[]) => {
      if (!marks.length) return ["（没有发现）", ""];
      return [
        "| # | 类型 | 内容 | 理由 | 判断 |",
        "| - | ---- | ---- | ---- | ---- |",
        ...marks.map(
          (mark, i) =>
            `| ${i + 1} | ${KIND_LABEL[mark.kind]} | ${cell(describe(mark))} | ${cell(mark.why)} |  |`
        ),
        "",
      ];
    };
    const global = rows.find(row => row.scope === "global");
    lines.push("## 全局", "", `**报告**：${global?.result.lead ?? "（无）"}`, "");
    lines.push(...markTable(global?.result.marks ?? []));
    if (global?.result.asks.length)
      lines.push(`**可以继续想**：${global.result.asks.map(a => a.text).join("；")}`, "");
    lines.push("### 问了但没写的候选组（给模型的）", "");
    for (const group of groups) {
      lines.push(
        `- ${group.times} 次：${group.prompts.map(p => `「${cell(p.text).slice(0, 50)}」(${p.nearest.toFixed(2)})`).join(" ")}`
      );
    }
    lines.push("");
    for (const topic of rows.filter(row => row.scope === "topic")) {
      lines.push(
        `## 主题：${topic.label}`,
        "",
        `**报告**：${topic.result.lead}`,
        "",
        `**概述**：${topic.overview.overview}`,
        ""
      );
      if (topic.overview.shift) lines.push(`**关注点变化**：${topic.overview.shift}`, "");
      lines.push(`**生长**：${topic.result.growth.join(" ")}`, "");
      lines.push(...markTable(topic.result.marks));
      if (topic.result.asks.length)
        lines.push(`**可以继续想**：${topic.result.asks.map(a => a.text).join("；")}`, "");
      const subs = rows.filter(row => row.scope === "subtopic" && row.parentId === topic.id);
      if (subs.length) {
        lines.push("子主题概述：", "");
        for (const sub of subs) {
          lines.push(
            `- **${sub.label}**：${sub.overview.overview}${sub.overview.shift ? `（变化：${sub.overview.shift}）` : ""}；发现 ${sub.result.marks.map(m => KIND_LABEL[m.kind]).join("、") || "无"}`
          );
        }
        lines.push("");
      }
    }
    lines.push("## 项目回顾", "");
    for (const project of reviewed) {
      const row = KnowledgeAiInsightsTable.getProject(main, project.id);
      lines.push(
        `### ${project.title}（${project.archived ? "结项回顾" : "生长回顾"}，${project.docs} 份）`,
        "",
        `**报告**：${row?.result.lead ?? "（失败）"}`,
        ""
      );
      if (row?.result.refs?.length)
        lines.push(`**核心观点**：${row.result.refs.map(r => `《${r.title}》`).join("、")}`, "");
      if (row?.result.home) lines.push(`**可以归入**：${row.result.home.title}`, "");
      lines.push(...markTable(row?.result.marks ?? []));
      if (row?.result.asks.length)
        lines.push(`**问题**：${row.result.asks.map(a => a.text).join("；")}`, "");
    }
    lines.push("## 阶段", "", ...phases.map(phase => `- ${phase}`), "");
    writeFileSync(OUT, lines.join("\n"));
    console.log(`[topic-insights.eval] 报告 ${OUT}`);
    main.close();
    index.close();
  },
  4 * 3600_000
);
