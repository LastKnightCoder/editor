/**
 * 脉络实测：在真实库副本上量 content_link 退役、引用与白板索引的首次对账、微信读书摘录回填与外部材料
 * 索引候选、每个实体的脉络查询耗时，并统计各分区非空的实体数。默认跳过；需要时把主库复制到临时目录（含 -wal）再跑，主进程测试要用
 * Electron 内置 Node（见 docs/knowledge-loop/05 踩坑）：
 *
 *   KL_CONTEXT_EVAL_MAIN=/tmp/kl-m.db \
 *   ELECTRON_RUN_AS_NODE=1 npx electron ../../node_modules/vitest/vitest.mjs run context.eval
 *
 * 会改动副本（迁移 content_link），不要指向正在使用的库。
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import type { EntityRef } from "@/entity/ref";
import { listMaterialIndexDocs } from "../../material-index";
import { getEntityContext } from "../context-query";
import { reconcileRefs } from "../ref-indexer";
import { reconcileWhiteboardRefs } from "../whiteboard-indexer";

const MAIN = process.env.KL_CONTEXT_EVAL_MAIN;
const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

it.skipIf(!MAIN)(
  "脉络实测（真实库副本）",
  async () => {
    const main = new Database(MAIN!);
    const index = new Database(":memory:");
    index.exec(readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8"));
    const timed = async <T>(label: string, run: () => T | Promise<T>) => {
      const started = performance.now();
      const result = await run();
      console.log(`${label}: ${Math.round(performance.now() - started)} ms`, result);
      return result;
    };

    main.exec(readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8"));
    await timed("引用索引首次对账", () => reconcileRefs(main, index));
    await timed("白板索引首次对账", () => reconcileWhiteboardRefs(main, index));
    await timed("白板索引再次对账（无变化）", () => reconcileWhiteboardRefs(main, index));
    await timed("外部材料索引候选（按类型计数）", async () =>
      (await listMaterialIndexDocs(main)).reduce<Record<string, number>>((counts, doc) => {
        counts[doc.type] = (counts[doc.type] ?? 0) + 1;
        return counts;
      }, {})
    );

    const refs: EntityRef[] = [
      ...(main.prepare(`SELECT id FROM cards`).all() as Array<{ id: number }>).map(
        row => ({ kind: "card", id: row.id }) as const
      ),
      ...(
        main.prepare(`SELECT id FROM articles WHERE is_delete = 0`).all() as Array<{
          id: number;
        }>
      ).map(row => ({ kind: "article", id: row.id }) as const),
      ...(
        main
          .prepare(`SELECT id FROM project_item WHERE project_item_type = 'document'`)
          .all() as Array<{ id: number }>
      ).map(row => ({ kind: "project-item", id: row.id }) as const),
    ];
    const durations: number[] = [];
    const nonEmpty = { sources: 0, derived: 0, notebookProjections: 0, usages: 0 };
    const usageKinds: Record<string, number> = {};
    for (const ref of refs) {
      const started = performance.now();
      const context = getEntityContext(main, index, ref);
      durations.push(performance.now() - started);
      if (!context) continue;
      for (const key of Object.keys(nonEmpty) as Array<keyof typeof nonEmpty>) {
        if (context[key].length > 0) nonEmpty[key]++;
      }
      for (const usage of context.usages)
        usageKinds[usage.kind] = (usageKinds[usage.kind] ?? 0) + 1;
    }
    durations.sort((a, b) => a - b);
    const total = durations.reduce((sum, ms) => sum + ms, 0);
    console.log(
      `脉络查询 ${refs.length} 个实体：平均 ${(total / refs.length).toFixed(2)} ms，` +
        `p95 ${percentile(durations, 0.95).toFixed(2)} ms，最大 ${durations.at(-1)?.toFixed(2)} ms`
    );
    console.log("非空分区的实体数", nonEmpty, "被使用条目按类型", usageKinds);

    main.close();
    index.close();
  },
  600_000
);
