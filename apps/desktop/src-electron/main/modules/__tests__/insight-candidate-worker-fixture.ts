import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { build } from "vite";

export async function candidateWorkerFixture(
  entry = "src-electron/main/workers/topic-insights-candidate.worker.ts"
) {
  const directory = await mkdtemp(join(tmpdir(), "tau-insight-worker-"));
  const desktop = resolve(__dirname, "../../../..");
  const workerPath = join(directory, "candidate-worker.cjs");
  const sqliteModulePath = createRequire(
    join(desktop, "../collaboration-server/package.json")
  ).resolve("better-sqlite3");
  try {
    await build({
      configFile: false,
      root: desktop,
      logLevel: "error",
      ssr: { noExternal: [/^@tau\//] },
      build: {
        ssr: join(desktop, entry),
        outDir: directory,
        emptyOutDir: false,
        target: "node24",
        minify: false,
        rolldownOptions: { output: { format: "cjs", entryFileNames: "candidate-worker.cjs" } },
      },
    });
    return {
      directory,
      workerPath,
      sqliteModulePath,
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
