import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

if (process.env.TAU_PERF_BENCH !== "1") {
  console.log("运行 pnpm --filter desktop bench:perf-diagnostics 启用独立基准。");
  process.exit(0);
}

const temporary = await mkdtemp(path.join(os.tmpdir(), "tau-perf-bench-"));
try {
  const outfile = path.join(temporary, "recorder.mjs");
  await build({
    entryPoints: [
      fileURLToPath(new URL("../src-electron/main/services/perf-diagnostics.ts", import.meta.url)),
    ],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { PerfDiagnostics } = await import(pathToFileURL(outfile).href);
  for (const [name, count, stepMs] of [
    ["normal", 1200, 100],
    ["burst", 20000, 1],
  ]) {
    let now = 0;
    const recorder = new PerfDiagnostics("benchmark", { now: () => now });
    const started = performance.now();
    for (let i = 0; i < count; i++) {
      now += stepMs;
      recorder.record(
        {
          t: now,
          kind: "stage",
          label: "content.snapshot",
          ms: 1,
          operationId: `bench-${i}`,
          context: { pageKey: "projects", contentId: 1 },
          values: { inputCount: 100 },
        },
        { pid: 1, type: "renderer", windowId: 1 }
      );
    }
    const elapsedMs = performance.now() - started;
    const snapshotStarted = performance.now();
    const snapshot = recorder.snapshot();
    console.log(
      JSON.stringify({
        name,
        count,
        elapsedMs: +elapsedMs.toFixed(2),
        microsecondsPerEvent: +((elapsedMs * 1000) / count).toFixed(2),
        snapshotMs: +(performance.now() - snapshotStarted).toFixed(2),
        retainedBytes: snapshot.collector.bytes,
        retainedEvents: snapshot.events.length,
        dropped: snapshot.collector.dropped,
      })
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
