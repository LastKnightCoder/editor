import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(desktop, "package.json"));
const output = join(desktop, "output/knowledge-insights-performance");
if (!process.versions.electron) {
  const { build } = await import("vite");
  await build({
    configFile: false,
    root: desktop,
    logLevel: "error",
    build: {
      ssr: join(desktop, "e2e/insight-candidates/runtime.ts"),
      outDir: join(output, "standalone"),
      target: "node24",
      minify: false,
      rolldownOptions: { output: { format: "cjs", entryFileNames: "runtime.cjs" } },
    },
  });
  const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    windowsHide: true,
  });
  process.exitCode = await new Promise(resolveCode => {
    child.once("error", error => {
      console.error(error);
      resolveCode(1);
    });
    child.once("exit", code => resolveCode(code ?? 1));
  });
} else {
  const { createInsightBench } = require(join(output, "standalone/runtime.cjs"));
  const directory = await mkdtemp(join(tmpdir(), "tau-insight-capacity-"));
  const options = {
    file: join(directory, "index.db"),
    workerPath: join(
      process.env.TAU_CONTENT_PRODUCTION_APP_OVERRIDE ?? desktop,
      "dist-electron/main/topic-insights-candidate-worker.js"
    ),
    sqliteModulePath: require.resolve("better-sqlite3"),
    extensionPath: require("sqlite-vec").getLoadablePath(),
    notes: Number(process.env.INSIGHT_NOTE_VECTORS ?? 10000),
    prompts: Number(process.env.INSIGHT_PROMPTS ?? 2000),
    dimensions: 1024,
  };
  assert(Number.isSafeInteger(options.notes) && options.notes > 0);
  assert(Number.isSafeInteger(options.prompts) && options.prompts > 0);
  const bench = createInsightBench(options);
  const reports = [];
  try {
    for (const mode of (process.env.INSIGHT_BENCH_MODES ?? "sync,worker").split(",")) {
      assert(mode === "sync" || mode === "worker");
      await bench.start(mode);
      const completed = await bench.finish();
      const record = { mode, ...bench.snapshot(), completed };
      assert.deepEqual(record.errors, []);
      assert.equal(record.cycles, 1);
      assert(completed.checkpoint.every(row => row.busy === 0));
      reports.push(record);
      console.log("INSIGHT_CANDIDATE_BENCH", JSON.stringify(record));
      await mkdir(output, { recursive: true });
      await writeFile(
        join(output, `candidates-${process.env.INSIGHT_REPORT_NAME ?? "report"}.json`),
        JSON.stringify({ options, reports }, null, 2)
      );
    }
    const before = reports.find(row => row.mode === "sync"),
      after = reports.find(row => row.mode === "worker");
    if (before && after) {
      assert.equal(after.digest, before.digest);
      assert(
        after.durations[0] <= before.durations[0] * 1.2 + 500,
        "Worker 候选总耗时超出对照门槛"
      );
    }
    if (after) {
      assert(after.loopP99Ms <= 50, "Worker 计算时主线程 P99 超过门槛");
      assert(after.loopMaxMs < 200, "Worker 计算时主线程出现长阻塞");
    }
  } finally {
    await bench.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}
