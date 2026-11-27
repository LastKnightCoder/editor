import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import AdmZip from "adm-zip";
import { downloadSymbols, uploadSymbols } from "./desktop-symbols-r2.mjs";
import { PerfSymbolicator } from "../apps/desktop/scripts/perf-symbolicate.mjs";
import { writeSymbolsFixture, memoryR2 } from "./desktop-symbols-test-support.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const buildId = "fixture-build";
const marker = `desktop-symbols/${buildId}/manifest.json`;
let directory, source, output, objects, client;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tau-symbols-test-"));
  source = path.join(directory, "source");
  output = path.join(directory, "download");
  await writeSymbolsFixture(source, buildId);
  ({ objects, client } = memoryR2());
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const upload = () => uploadSymbols({ symbolsRoot: source, buildId, client });
const download = () => downloadSymbols({ symbolsRoot: output, buildId, client });

test("共用桶的映射上传取回保留安装包与更新清单，离线工具可直接读取且重复下载不覆盖", async () => {
  const releases = new Map([
    ["desktop/latest.yml", Buffer.from("version: 1.0.0\n")],
    ["desktop/Tau-v1.0.0-win32.exe", Buffer.from("installer")],
  ]);
  for (const [key, bytes] of releases) objects.set(key, bytes);
  await upload();
  await download();
  const key = "renderer/probe.js.map";
  assert.deepEqual(
    await readFile(path.join(source, buildId, key)),
    await readFile(path.join(output, buildId, key))
  );
  const position = await new PerfSymbolicator(output).locate(buildId, {
    url: "renderer/probe.js",
    functionName: "probe",
    scriptId: "1",
    lineNumber: 0,
    columnNumber: 0,
  });
  assert.equal(position.original.file, "src/probe.ts");
  assert.equal(position.original.line, 1);
  assert.equal((await download()).reused, true);
  await upload();
  for (const [key, bytes] of releases) assert.deepEqual(objects.get(key), bytes);
  const symbols = [...objects.keys()].filter(key => !releases.has(key));
  assert(symbols.length > 0);
  assert(symbols.every(key => key.startsWith(`desktop-symbols/${buildId}/`)));
});

test("上传中断不发布完成标记，之后重试能恢复同一构建", async () => {
  const putText = client.putText;
  client.putText = async () => {
    throw new Error("network interrupted");
  };
  await assert.rejects(upload, /network interrupted/);
  assert.equal(objects.has(marker), false);
  await assert.rejects(download, /没有构建/);
  client.putText = putText;
  await upload();
  assert.equal((await download()).reused, false);
});

test("本地映射损坏或同一 buildId 内容改变时拒绝上传，不覆盖远端构建", async () => {
  await upload();
  const before = objects.get(marker).toString();
  const mapFile = path.join(source, buildId, "main/probe.js.map");
  await writeFile(mapFile, "corrupt");
  await assert.rejects(upload, /SHA-256 不一致/);
  const manifestFile = path.join(source, buildId, "manifest-main.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.files["main/probe.js"].mapSha256 = hash("corrupt");
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(upload, /已有不同归档/);
  assert.equal(objects.get(marker).toString(), before);
});

test("下载损坏的归档不会留下半份构建，也不会改动已有目录", async () => {
  const descriptor = await upload();
  objects.set(descriptor.archive.key, Buffer.from("broken"));
  await mkdir(output);
  await writeFile(path.join(output, "keep.txt"), "keep");
  await assert.rejects(download, /SHA-256 不一致/);
  assert.deepEqual(await readdir(output), ["keep.txt"]);
});

test("两个不同内容的上传同时提交时只接受一份，已提交映射仍能完整下载", async () => {
  const other = path.join(directory, "other");
  await cp(source, other, { recursive: true });
  const file = path.join(other, buildId, "main/probe.js.map");
  const map = JSON.parse(await readFile(file, "utf8"));
  map.sourcesContent = ["export const value = 2;"];
  const content = JSON.stringify(map);
  await writeFile(file, content);
  const manifestFile = path.join(other, buildId, "manifest-main.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.files["main/probe.js"].mapSha256 = hash(content);
  await writeFile(manifestFile, JSON.stringify(manifest));
  let reads = 0,
    release;
  const barrier = new Promise(resolve => {
    release = resolve;
  });
  const getText = client.getText;
  client.getText = async key => {
    if (key === marker && reads < 2) {
      if (++reads === 2) release();
      await barrier;
      return null;
    }
    return getText(key);
  };
  const results = await Promise.allSettled([
    upload(),
    uploadSymbols({ symbolsRoot: other, buildId, client }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const failure = results.find(result => result.status === "rejected");
  assert.match(failure.reason.message, /已有不同归档/);
  await download();
  const remote = JSON.parse(objects.get(marker).toString());
  const success = results.find(result => result.status === "fulfilled");
  assert.equal(remote.fingerprint, success.value.fingerprint);
});

test("ZIP 中清单之外的文件不会被安装到本地映射目录", async () => {
  const descriptor = await upload();
  const zip = new AdmZip(objects.get(descriptor.archive.key));
  zip.addFile("renderer/untracked.map", Buffer.from("unexpected"));
  const bytes = zip.toBuffer();
  descriptor.archive = {
    key: `desktop-symbols/${buildId}/symbols-${hash(bytes)}.zip`,
    bytes: bytes.length,
    sha256: hash(bytes),
  };
  objects.set(descriptor.archive.key, bytes);
  objects.set(marker, Buffer.from(JSON.stringify(descriptor)));
  await assert.rejects(download, /额外文件/);
  assert.deepEqual(await readdir(output), []);
});

test("只校验模式不依赖远端，拒绝越过归档目录的 buildId", async () => {
  const result = await uploadSymbols({ symbolsRoot: source, buildId, dryRun: true });
  assert.equal(result.buildId, buildId);
  assert(result.archive.bytes > 0);
  await assert.rejects(
    uploadSymbols({ symbolsRoot: source, buildId: "../other", dryRun: true }),
    /无效的 buildId/
  );
});
