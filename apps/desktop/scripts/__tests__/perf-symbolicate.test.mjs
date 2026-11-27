import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { perfSymbolsPlugin } from "../perf-symbols-build.mjs";
import { PerfSymbolicator, symbolicatePerf } from "../perf-symbolicate.mjs";

let directory, generated, stack, location;
const buildId = "test-build";
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tau-symbols-"));
  const source = path.join(directory, "src/probe.mjs");
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(
    source,
    `export function mappingProbe() {\n  const value = Math.random();\n  throw new Error(String(value));\n}\n`
  );
  generated = path.join(directory, "dist/assets/probe.mjs");
  await build({
    entryPoints: [source],
    outfile: generated,
    bundle: true,
    platform: "node",
    format: "esm",
    minify: true,
    sourcemap: "external",
  });
  const fixture = await import(pathToFileURL(generated).href);
  try {
    fixture.mappingProbe();
  } catch (error) {
    stack = error.stack;
  }
  const match = stack.match(/probe\.mjs:(\d+):(\d+)/);
  assert(match, "真实压缩产物没有堆栈位置");
  location = {
    functionName: "minified",
    scriptId: "1",
    url: "renderer/assets/probe.mjs",
    lineNumber: Number(match[1]) - 1,
    columnNumber: Number(match[2]) - 1,
  };
  const plugin = perfSymbolsPlugin(
    {
      id: buildId,
      version: "test",
      revision: "test",
      directory: path.join(directory, "symbols"),
      repository: directory,
    },
    "renderer"
  );
  plugin.writeBundle(
    { dir: path.join(directory, "dist") },
    { probe: { type: "chunk", fileName: "assets/probe.mjs" } }
  );
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("真实压缩堆栈和 CPU 零基位置都还原到同一源码行，图结构保持不变", async () => {
  const profile = {
    startTime: 0,
    endTime: 1000,
    nodes: [{ id: 1, callFrame: location }],
    samples: [1],
    timeDeltas: [1000],
  };
  const report = await symbolicatePerf(
    {
      meta: { buildId },
      incidents: [
        {
          id: "one",
          cpu: {
            buildId,
            status: "complete",
            profile,
            summary: { top: [{ frame: location, selfMs: 1, totalMs: 1 }] },
          },
        },
      ],
    },
    path.join(directory, "symbols"),
    stack,
    true
  );
  const frame = report.cpu[0].summary.top[0].frame;
  assert.equal(frame.original.file, "src/probe.mjs");
  assert.equal(frame.original.line, 3);
  assert.equal(report.stacks[0].original.line, 3);
  assert.deepEqual(report.cpu[0].profile.samples, profile.samples);
  assert.equal(report.cpu[0].profile.nodes[0].callFrame.lineNumber, 2);
  await assert.rejects(readFile(`${generated}.map`), { code: "ENOENT" });
});

test("构建身份或映射完整性不符时明确拒绝，绝不回退到相近版本", async () => {
  const symbols = new PerfSymbolicator(path.join(directory, "symbols"));
  assert.equal((await symbols.locate("other-build", location)).unmapped, "missing-symbols");
  const manifestFile = path.join(directory, "symbols", buildId, "manifest-renderer.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.buildId = "wrong-build";
  await writeFile(manifestFile, JSON.stringify(manifest));
  assert.equal((await symbols.locate(buildId, location)).unmapped, "build-mismatch");
  manifest.buildId = buildId;
  await writeFile(manifestFile, JSON.stringify(manifest));
  await writeFile(path.join(directory, "symbols", buildId, "renderer/assets/probe.mjs.map"), "{}");
  assert.equal((await symbols.locate(buildId, location)).unmapped, "map-hash-mismatch");
  assert.equal(
    (await symbols.locate(buildId, { ...location, url: "renderer/../../private.js" })).unmapped,
    "external-or-native"
  );
});
