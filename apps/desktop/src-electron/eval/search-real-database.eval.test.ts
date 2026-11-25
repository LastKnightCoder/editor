// @vitest-environment node
/**
 * 使用只读真实库副本测量搜索开销；报告不包含查询词、正文或结果标题。
 * TAU_SEARCH_BENCH_DIR 指向含 main.db、index.db 和 manifest.json 的隔离目录；
 * manifest 指定 main/index 路径，原库必须先用 SQLite backup API 复制（包含 WAL）。
 * 显式使用 vitest.eval.config.ts 运行；默认单测不收集本文件。
 */
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { expect, it, vi } from "vitest";
import log from "electron-log";

vi.mock("electron");
vi.mock("../main/modules/video-note-index-queue");
vi.mock("../main/services/content-execution", () => ({
  contentExecutor: {
    execute: async (request: import("../../shared/content-execution").ContentExecutionRequest) => {
      await import("@/app/plugins/content-runtime");
      const runtime = globalThis as typeof globalThis & {
        tauContentExecute(input: unknown): Promise<unknown>;
      };
      return runtime.tauContentExecute({ hash: "search-eval", artifacts: [], request });
    },
  },
}));

import FTSTable from "../main/modules/tables/fts";
import CatalogSearchTable from "../main/modules/tables/catalog-search";
import { queryTasks } from "../main/modules/task-assistant/query";
import { CATALOG_SEARCH_TYPES } from "@/types/search";

const directory = process.env.TAU_SEARCH_BENCH_DIR;
const rounds = Number(process.env.TAU_SEARCH_BENCH_ROUNDS ?? 20);
const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return { n: values.length, p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1) ?? 0 };
};

it.skipIf(!directory)(
  "真实库的正文基线、新增查询和合并耗时",
  async () => {
    if (!directory) throw new Error("缺少副本目录");
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    for (const file of [manifest.main, manifest.index]) {
      if (resolve(file).startsWith(resolve(process.env.HOME ?? "", ".editor")))
        throw new Error("仅允许在隔离副本上运行");
    }
    const main = new Database(manifest.main, { readonly: true, fileMustExist: true });
    const index = new Database(manifest.index, { readonly: true, fileMustExist: true });
    main.pragma("query_only = ON");
    index.pragma("query_only = ON");
    sqliteVec.load(index);
    const silentInfo = vi.spyOn(log, "info").mockImplementation(() => undefined);
    const queries: Array<{ label: string; text: string }> = [
      { label: "year", text: "2026年" },
      { label: "common-word", text: "学习" },
      { label: "common-character", text: "的" },
      { label: "latin", text: "AI" },
      { label: "no-match", text: "龘靐齉爩" },
    ];
    for (const [label, sql] of [
      [
        "todo-title",
        "SELECT title AS text FROM todo_item WHERE is_archived=0 ORDER BY update_time DESC LIMIT 1",
      ],
      [
        "project-title",
        "SELECT title AS text FROM project WHERE archived=0 ORDER BY update_time DESC LIMIT 1",
      ],
      [
        "flashcard-word",
        "SELECT value AS text FROM flashcards,json_tree(prompt) WHERE key='text' AND length(value)>3 LIMIT 1",
      ],
    ]) {
      const db = label === "document-task" ? index : main;
      const row = db.prepare(sql).get() as { text: string } | undefined;
      if (row?.text.trim()) queries.push({ label, text: row.text.trim().slice(0, 4) });
    }
    const liveTasks = queryTasks(main, index, "benchmark", {
      source: "document",
      archived: false,
      pageSize: 100,
    });
    if (liveTasks.items[0])
      queries.push({ label: "document-task", text: liveTasks.items[0].title.slice(0, 4) });
    const characters = new Map<string, number>();
    for (const task of liveTasks.items)
      for (const char of new Set(task.title.match(/[A-Za-z\u4e00-\u9fff]/g) ?? []))
        characters.set(char, (characters.get(char) ?? 0) + 1);
    const denseWord = [...characters].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (denseWord) queries.push({ label: "dense-document-task", text: denseWord });
    const resultRows: unknown[] = [];
    let totalFts = 0;
    try {
      for (const query of queries) {
        const fts = () =>
          FTSTable.searchHybridContent(main, index, { query: query.text, limit: 24 });
        const catalog = () =>
          CatalogSearchTable.search(main, {
            keyword: query.text,
            types: [...CATALOG_SEARCH_TYPES],
            limit: 24,
          });
        const docs = () =>
          queryTasks(main, index, "benchmark", {
            keyword: query.text,
            source: "document",
            archived: false,
            sort: "updatedAt",
            pageSize: 24,
          });
        const baseline: number[] = [],
          added: number[] = [],
          combined: number[] = [];
        const catalogMs: number[] = [],
          docsMs: number[] = [],
          loopLag: number[] = [];
        let counts = { fts: 0, catalog: 0, docs: 0, warnings: 0 };
        let cold: Record<string, number> = {};
        for (let iteration = -3; iteration < rounds; iteration++) {
          let fullMs = 0;
          const measureCombined = async () => {
            const started = performance.now();
            await Promise.all([fts(), Promise.resolve(catalog()), Promise.resolve(docs())]);
            return performance.now() - started;
          };
          if (iteration % 2 !== 0) fullMs = await measureCombined();
          let start = performance.now();
          const contents = await fts();
          const originalMs = performance.now() - start;
          const lagStart = performance.now();
          const lag = new Promise<number>(done =>
            setTimeout(() => done(performance.now() - lagStart), 0)
          );
          start = performance.now();
          const names = catalog();
          const namesMs = performance.now() - start;
          start = performance.now();
          const tasks = docs();
          const tasksMs = performance.now() - start;
          const addedMs = namesMs + tasksMs;
          const lagMs = await lag;
          if (iteration % 2 === 0) fullMs = await measureCombined();
          counts = {
            fts: contents.length,
            catalog: names.length,
            docs: tasks.items.length,
            warnings: tasks.warnings.length,
          };
          totalFts += contents.length;
          if (iteration === -3)
            cold = { baseline: originalMs, catalog: namesMs, docs: tasksMs, combined: fullMs };
          if (iteration >= 0) {
            baseline.push(originalMs);
            added.push(addedMs);
            combined.push(fullMs);
            catalogMs.push(namesMs);
            docsMs.push(tasksMs);
            loopLag.push(lagMs);
          }
        }
        const byType: Record<string, number> = {};
        for (const type of CATALOG_SEARCH_TYPES) {
          const values: number[] = [];
          for (let n = 0; n < 5; n++) {
            const start = performance.now();
            CatalogSearchTable.search(main, { keyword: query.text, types: [type], limit: 24 });
            values.push(performance.now() - start);
          }
          byType[type] = stats(values).p50;
        }
        resultRows.push({
          label: query.label,
          queryLength: query.text.length,
          counts,
          cold,
          baseline: stats(baseline),
          added: stats(added),
          combined: stats(combined),
          catalog: stats(catalogMs),
          documentTasks: stats(docsMs),
          eventLoopLag: stats(loopLag),
          byType,
        });
      }
      expect(totalFts, "正文基线必须确实查询到真实数据").toBeGreaterThan(0);
      const report = {
        createdAt: new Date().toISOString(),
        rounds,
        runtime: process.version,
        counts: { main: manifest.mainCounts, index: manifest.indexCounts },
        memory: process.memoryUsage(),
        results: resultRows,
      };
      const reportPath = join(
        directory,
        `results${process.env.TAU_SEARCH_BENCH_RUN ? `-${process.env.TAU_SEARCH_BENCH_RUN}` : ""}.json`
      );
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ reportPath, scenarios: resultRows.length, rounds }));
    } finally {
      silentInfo.mockRestore();
      main.close();
      index.close();
    }
  },
  180_000
);
