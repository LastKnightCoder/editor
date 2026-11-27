import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPerfBuild } from "../apps/desktop/scripts/perf-symbols-build.mjs";
import { recordArtifactBuild, readArtifactBuilds } from "./desktop-artifact-build.mjs";
import { publishReleaseSymbols } from "./desktop-publish-symbols.mjs";
import { writeSymbolsFixture, memoryR2 } from "./desktop-symbols-test-support.mjs";

let directory, releaseDir, symbolsRoot;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tau-publish-symbols-"));
  releaseDir = path.join(directory, "release");
  symbolsRoot = path.join(directory, "symbols");
  await mkdir(releaseDir);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function artifact(name, buildId, content = name) {
  const file = path.join(releaseDir, name);
  await writeFile(file, content);
  await recordArtifactBuild({ file, buildId, version: "1.0.0" });
  return name;
}

test("同一版本的独立构建生成不同 ID，无需依赖时钟或版本号变化", async () => {
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ version: "1.0.0" }));
  const first = createPerfBuild(directory),
    second = createPerfBuild(directory);
  assert.equal(first.version, second.version);
  assert.notEqual(first.id, second.id);
});

test("同版本跨平台各自归档，同一 JS 构建的 Mac 多架构共用映射，重试不采用最新指针", async () => {
  const mac = "mac-build",
    windows = "windows-build";
  await writeSymbolsFixture(symbolsRoot, mac);
  await writeSymbolsFixture(symbolsRoot, windows);
  const artifacts = [
    await artifact("Tau-v1.0.0-darwin-x64.zip", mac),
    await artifact("Tau-v1.0.0-darwin-arm64.zip", mac),
    await artifact("Tau-v1.0.0-win32.exe", windows),
  ];
  await writeFile(
    path.join(symbolsRoot, "latest.json"),
    JSON.stringify({ buildId: "later-build" })
  );
  const dry = await publishReleaseSymbols({
    releaseDir,
    symbolsRoot,
    version: "1.0.0",
    artifacts,
    dryRun: true,
  });
  assert.deepEqual(new Set(dry.map(value => value.buildId)), new Set([mac, windows]));
  assert.deepEqual(dry.find(value => value.buildId === mac).artifacts, artifacts.slice(0, 2));
  const { client, objects } = memoryR2();
  await publishReleaseSymbols({
    releaseDir,
    symbolsRoot,
    version: "1.0.0",
    artifacts,
    dryRun: false,
    client,
  });
  for (const id of [mac, windows]) assert(objects.has(`desktop-symbols/${id}/manifest.json`));
  await rm(path.join(symbolsRoot, windows), { recursive: true });
  await publishReleaseSymbols({
    releaseDir,
    symbolsRoot,
    version: "1.0.0",
    artifacts,
    dryRun: false,
    client,
  });
  assert.equal(
    JSON.parse(await readFile(path.join(symbolsRoot, windows, "manifest-main.json"), "utf8"))
      .buildId,
    windows
  );
});

test("缺少绑定或安装包同大小被修改时拒绝发布，不会误用现有 map", async () => {
  const name = "Tau-v1.0.0-win32.exe";
  await writeFile(path.join(releaseDir, name), "before");
  await assert.rejects(
    readArtifactBuilds({ releaseDir, version: "1.0.0", artifacts: [name] }),
    /缺少构建绑定/
  );
  await artifact(name, "original-build", "before");
  await writeFile(path.join(releaseDir, name), "after!");
  const { client, objects } = memoryR2();
  await assert.rejects(
    publishReleaseSymbols({ releaseDir, symbolsRoot, version: "1.0.0", artifacts: [name], client }),
    /构建绑定不一致/
  );
  assert.equal(objects.size, 0);
});

test("映射上传失败不会被视为发布准备完成，缺失映射也不能用版本号替代", async () => {
  const name = await artifact("Tau-v1.0.0-win32.exe", "exact-build");
  const { client, objects } = memoryR2();
  await assert.rejects(
    publishReleaseSymbols({ releaseDir, symbolsRoot, version: "1.0.0", artifacts: [name], client }),
    /没有构建/
  );
  await writeSymbolsFixture(symbolsRoot, "exact-build");
  client.putFile = async () => {
    throw new Error("R2 unavailable");
  };
  await assert.rejects(
    publishReleaseSymbols({ releaseDir, symbolsRoot, version: "1.0.0", artifacts: [name], client }),
    /R2 unavailable/
  );
  assert.equal(objects.has("desktop-symbols/exact-build/manifest.json"), false);
});
