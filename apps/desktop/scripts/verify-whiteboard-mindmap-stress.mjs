import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureNodeSqlite } from "../../../scripts/ensure-node-sqlite.mjs";

assert.equal(process.env.TAU_MINDMAP_STRESS, "1", "请通过 test:mindmap-stress 显式执行压力验证");
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(desktop, "../..");
const argument = (name, fallback) =>
  process.argv
    .slice(2)
    .find(value => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const profile = argument("profile", "full"),
  selected = argument("phase", "all");
assert(["full", "smoke"].includes(profile));
const phases =
  selected === "all"
    ? ["capacity", "mixed", "concurrency", "soak", "recovery", "network"]
    : selected.split(",");
assert(
  phases.every(phase =>
    ["capacity", "mixed", "concurrency", "soak", "recovery", "network", "batch-profile"].includes(
      phase
    )
  )
);
const directory = mkdtempSync(join(tmpdir(), "tau-mindmap-stress-build-"));
const output = join(root, "output/whiteboard-mindmap-stress", profile);
mkdirSync(output, { recursive: true });
const source = join(
  desktop,
  "src-electron/main/modules/whiteboard-documents/__tests__/mindmap-stress"
);
const sqlite = createRequire(join(root, "apps/collaboration-server/package.json")).resolve(
  "better-sqlite3"
);
try {
  assert(ensureNodeSqlite(), "压力入口需要当前 Node ABI 的 SQLite");
  await build({
    entryPoints: {
      runner: join(source, "run.ts"),
      "kill-agent": join(source, "kill.ts"),
      "whiteboard-append-worker": join(
        desktop,
        "src-electron/main/workers/whiteboard-append.worker.ts"
      ),
    },
    outdir: directory,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    alias: { "better-sqlite3": sqlite },
    external: [sqlite],
    tsconfig: join(desktop, "tsconfig.json"),
    logLevel: "silent",
  });
  const hash = file =>
    createHash("sha256")
      .update(readFileSync(join(directory, file)))
      .digest("hex");
  const manifest = {
    profile,
    runnerSha256: hash("runner.js"),
    appendWorkerSha256: hash("whiteboard-append-worker.js"),
    killerSha256: hash("kill-agent.js"),
    phases,
  };
  writeFileSync(join(output, "build.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const phase of phases) {
    const report = join(output, `${phase}.json`),
      log = [];
    for (const file of [report, join(output, `${phase}.log`)])
      if (existsSync(file)) {
        const history = join(output, "history");
        mkdirSync(history, { recursive: true });
        renameSync(
          file,
          join(
            history,
            `${phase}-${Date.now()}-${file.endsWith(".log") ? "log.txt" : "report.json"}`
          )
        );
      }
    const sourceFiles =
      phase === "network"
        ? [
            "packages/collaboration/src/whiteboard-model.ts",
            "apps/desktop/shared/whiteboard-mindmap.ts",
            "apps/desktop/src-electron/main/modules/whiteboard-documents/agent.ts",
            "apps/desktop/src-electron/main/modules/whiteboard-documents/mindmap-agent.ts",
            "apps/desktop/src-electron/main/modules/whiteboard-documents/mindmap-text.ts",
            "apps/desktop/src-electron/main/modules/whiteboard-documents/mindmap-insert.ts",
            "apps/desktop/src-electron/main/modules/whiteboard-documents/mindmap-structure.ts",
            "apps/desktop/src-electron/main/modules/whiteboard-documents/mindmap-presentation.ts",
            "apps/desktop/src-electron/main/modules/whiteboard-documents/mindmap-annotations.ts",
            "apps/desktop/src-electron/main/modules/whiteboard-documents/sessions.ts",
            "apps/desktop/src/services/whiteboard-documents/agent-tools.ts",
            "apps/desktop/src/services/whiteboard-documents/mindmap-tools.ts",
            "apps/desktop/src/services/whiteboard-documents/__tests__/drag-realtime.test.tsx",
          ]
        : [];
    const sourceHash = file =>
      createHash("sha256")
        .update(readFileSync(join(root, file)))
        .digest("hex");
    const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, sourceHash(file)]));
    const phaseBuild = {
      ...manifest,
      ...(phase === "network"
        ? { mode: "vitest-source", sourceHashes }
        : { mode: "frozen-bundle" }),
    };
    const began = performance.now();
    console.info(`[mindmap-stress] ${profile}/${phase} started`);
    await new Promise((resolvePhase, reject) => {
      const vitest = join(
        dirname(createRequire(join(desktop, "package.json")).resolve("vitest/package.json")),
        "vitest.mjs"
      );
      const child = spawn(
        process.execPath,
        phase === "network"
          ? [
              vitest,
              "run",
              "src/services/whiteboard-documents/__tests__/drag-realtime.test.tsx",
              "-t",
              "原生导图工具离线.*压力",
              "--maxWorkers",
              "1",
              "--no-file-parallelism",
              "--silent=passed-only",
            ]
          : [
              join(directory, "runner.js"),
              root,
              phase,
              profile,
              report,
              join(directory, "kill-agent.js"),
            ],
        {
          cwd: phase === "network" ? desktop : root,
          env: {
            ...process.env,
            TAU_MINDMAP_STRESS_PROFILE: profile,
            TAU_MINDMAP_STRESS_BUILD: JSON.stringify(phaseBuild),
          },
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      const timeout = setTimeout(
        () => {
          child.kill("SIGKILL");
          reject(new Error(`压力阶段超时：${phase}`));
        },
        20 * 60 * 1000
      );
      child.stdout.on("data", bytes => {
        log.push(String(bytes));
        process.stdout.write(bytes);
      });
      child.stderr.on("data", bytes => {
        log.push(String(bytes));
      });
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", code => {
        clearTimeout(timeout);
        writeFileSync(join(output, `${phase}.log`), log.join(""));
        try {
          if (existsSync(report)) {
            const value = JSON.parse(readFileSync(report, "utf8"));
            value.build = phaseBuild;
            value.processElapsedMs = performance.now() - began;
            const changed = sourceFiles.filter(file => sourceHashes[file] !== sourceHash(file));
            if (changed.length) {
              value.status = "source_changed";
              value.changedSources = changed;
            }
            writeFileSync(report, JSON.stringify(value, null, 2) + "\n");
            assert.equal(changed.length, 0, "验证期间源码发生变化，需要固定源码后重测该阶段");
          }
          if (code !== 0)
            throw new Error(
              `压力阶段失败：${phase}；诊断见 ${report}\n${log.join("").slice(-4000)}`
            );
          resolvePhase();
        } catch (error) {
          reject(error);
        }
      });
    });
    const result = JSON.parse(readFileSync(report, "utf8"));
    assert.equal(result.status, "passed");
    result.build = phaseBuild;
    writeFileSync(report, JSON.stringify(result, null, 2) + "\n");
    console.info(
      `[mindmap-stress] ${phase} passed (${Math.round(result.elapsedMs ?? result.processElapsedMs)}ms)`
    );
  }
} finally {
  assert(resolve(directory).startsWith(resolve(tmpdir()) + sep), "清理范围必须在测试临时目录内");
  rmSync(directory, { recursive: true, force: true });
}
