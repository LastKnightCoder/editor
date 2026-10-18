// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { afterEach, expect, it } from "vitest";
import { PluginUpdates } from "../plugin-updates";
import { discoverPlugins } from "../plugin-discovery";
import { acquirePluginSyncLease } from "@tau/plugins/sync-leases";

const roots: string[] = [];
const id = "test.update";
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "tau-plugin-update-"));
  roots.push(root);
  const directory = path.join(root, "plugins");
  const service = new PluginUpdates(directory, "0.58.0");
  await service.initialize();
  const version = async () =>
    JSON.parse(await readFile(path.join(directory, id, "manifest.json"), "utf8")).version;
  const restart = async () => {
    const next = new PluginUpdates(directory, "0.58.0");
    await next.initialize();
    return next;
  };
  return { root, directory, service, version, restart };
}
async function zip(root: string, version: string, minimum?: string, corrupt = false) {
  const code = `throw new Error('静态校验不应执行代码 ${version}');`;
  const manifest = {
    formatVersion: 1,
    apiVersion: 1,
    id,
    name: "更新测试",
    version,
    platform: "desktop",
    format: "cjs",
    main: "main.js",
    ...(minimum ? { minAppVersion: minimum } : {}),
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
  };
  const archive = new AdmZip();
  archive.addFile(id + "/manifest.json", Buffer.from(JSON.stringify(manifest)));
  archive.addFile(id + "/main.js", Buffer.from(corrupt ? "changed" : code));
  const file = path.join(root, version + ".zip");
  archive.writeZip(file);
  return file;
}
async function install(context: Awaited<ReturnType<typeof setup>>, version = "1.0.0") {
  await context.service.stageZip(await zip(context.root, version));
  await context.restart();
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it("CLI占用期间启动不应用暂存更新，释放后下次启动仍可继续安装", async () => {
  const s = await setup();
  await install(s);
  await s.service.stageZip(await zip(s.root, "1.1.0"));
  const release = await acquirePluginSyncLease(s.directory, id);
  try {
    const next = await s.restart();
    expect(await s.version()).toBe("1.0.0");
    expect(await next.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, pending: true, pendingVersion: "1.1.0" }),
      ])
    );
  } finally {
    await release();
  }
  await s.restart();
  expect(await s.version()).toBe("1.1.0");
});

it("暂存不执行/不热替换，重启安装、升级、取消及恢复上一版", async () => {
  const s = await setup();
  await s.service.stageZip(await zip(s.root, "1.0.0", "0.58.0"));
  expect((await discoverPlugins(s.directory, "0.58.0")).entries).toEqual([]);
  expect((await s.service.list())[0].pendingVersion).toBe("1.0.0");
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
  await s.service.stageZip(await zip(s.root, "1.1.0"));
  expect(await s.version()).toBe("1.0.0");
  await s.service.cancel(id);
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
  await s.service.stageZip(await zip(s.root, "1.1.0"));
  await s.restart();
  expect(await s.version()).toBe("1.1.0");
  expect((await s.service.list())[0].previousVersion).toBe("1.0.0");
  await s.service.restore(id);
  expect(await s.version()).toBe("1.1.0");
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
});

it("最低版本、坏哈希、重复更新和非递增版本不覆盖当前包", async () => {
  const s = await setup();
  await install(s);
  await expect(s.service.stageZip(await zip(s.root, "2.0.0", "0.59.0"))).rejects.toThrow(
    "需要 Tau"
  );
  await expect(s.service.stageZip(await zip(s.root, "2.0.0", undefined, true))).rejects.toThrow(
    "产物不完整"
  );
  await expect(s.service.stageZip(await zip(s.root, "1.0.0"))).rejects.toThrow("必须高于");
  const file = await zip(s.root, "1.1.0");
  const results = await Promise.allSettled([s.service.stageZip(file), s.service.stageZip(file)]);
  expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
  expect(await s.version()).toBe("1.0.0");
});

it("暂存后包损坏或当前包变化，在启动时保留旧包并记录错误", async () => {
  const s = await setup();
  await install(s);
  await s.service.stageZip(await zip(s.root, "1.1.0"));
  await writeFile(path.join(s.root, "plugin-updates/pending", id, "package/main.js"), "broken");
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
  expect((await s.service.list())[0].error).toContain("产物不完整");
  await s.service.stageZip(await zip(s.root, "1.2.0"));
  const manifest = path.join(s.directory, id, "manifest.json");
  await writeFile(manifest, (await readFile(manifest, "utf8")) + "\n");
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
  expect((await s.service.list())[0].error).toContain("发生变化");
});

it.each(["before-move", "after-move", "after-install", "committed"])(
  "进程中断 %s 后按事务恢复，不动数据",
  async point => {
    const s = await setup();
    await install(s);
    const data = path.join(s.root, "private-data.json");
    await writeFile(data, "user data");
    await s.service.stageZip(await zip(s.root, "1.1.0"));
    const pending = path.join(s.root, "plugin-updates/pending", id);
    const transaction = path.join(s.root, "plugin-updates/transactions", id);
    await rename(pending, transaction);
    const recordPath = path.join(transaction, "record.json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    await writeFile(recordPath, JSON.stringify({ ...record, phase: "prepared" }));
    if (point !== "before-move")
      await rename(path.join(s.directory, id), path.join(transaction, "previous"));
    if (["after-install", "committed"].includes(point))
      await rename(path.join(transaction, "package"), path.join(s.directory, id));
    if (point === "committed")
      await writeFile(recordPath, JSON.stringify({ ...record, phase: "committed" }));
    await s.restart();
    expect(await s.version()).toBe(point === "committed" ? "1.1.0" : "1.0.0");
    expect(await readFile(data, "utf8")).toBe("user data");
    expect(await readdir(path.dirname(transaction))).toEqual([]);
  }
);

it("直接解压的不兼容包在扫描时明确拒绝，旧包未声明仍可用", async () => {
  const s = await setup();
  const archive = new AdmZip(await zip(s.root, "1.0.0", "0.58.0"));
  await mkdir(s.directory, { recursive: true });
  archive.extractAllTo(s.directory);
  const result = await discoverPlugins(s.directory, "0.57.2");
  expect(result.entries[0].artifact).toBeUndefined();
  expect(result.entries[0].error).toContain("需要 Tau 0.58.0");
});

it("首次安装中断恢复未安装状态，失败包保留用于排查", async () => {
  const s = await setup();
  await s.service.stageZip(await zip(s.root, "1.0.0"));
  const transaction = path.join(s.root, "plugin-updates/transactions", id);
  await rename(path.join(s.root, "plugin-updates/pending", id), transaction);
  await writeFile(
    path.join(transaction, "record.json"),
    JSON.stringify({ id, baseline: null, phase: "prepared" })
  );
  await rename(path.join(transaction, "package"), path.join(s.directory, id));
  await s.restart();
  expect((await discoverPlugins(s.directory)).entries).toEqual([]);
  expect(await readdir(path.join(s.root, "plugin-updates/failed"))).toHaveLength(1);
});

it("损坏事务保持阻断，损坏待更新仍能取消", async () => {
  const s = await setup();
  await install(s);
  await s.service.stageZip(await zip(s.root, "1.1.0"));
  const pending = path.join(s.root, "plugin-updates/pending", id);
  await writeFile(path.join(pending, "package/manifest.json"), "broken");
  expect((await s.service.list())[0].pending).toBe(true);
  await s.service.cancel(id);
  expect(await s.service.list()).toEqual([]);
  const transaction = path.join(s.root, "plugin-updates/transactions", id);
  await mkdir(transaction);
  await writeFile(path.join(transaction, "record.json"), "broken");
  await s.restart();
  expect((await s.service.list())[0].blocked).toBe(true);
  expect(await s.version()).toBe("1.0.0");
});

const center = (version: string) => ({
  kind: "center" as const,
  releaseId: `release-${version}`,
  pluginId: id,
  version,
  sha256: "c".repeat(64),
});
async function documented(root: string, version: string, extra?: string) {
  const archive = new AdmZip(await zip(root, version));
  archive.addFile(id + "/README.md", Buffer.from("# 更新测试"));
  archive.addFile(id + "/CHANGELOG.md", Buffer.from("## " + version));
  archive.addFile(id + "/LICENSE", Buffer.from("MIT"));
  if (extra) archive.addFile(id + "/" + extra, Buffer.from("x"));
  return archive.toBuffer();
}

it("门户规范 ZIP 的说明文件随包保存，其他额外文件仍拒绝", async () => {
  const s = await setup();
  await expect(
    s.service.stageRelease(await documented(s.root, "1.0.0", "notes.txt"), center("1.0.0"))
  ).rejects.toThrow("不符合插件约定");
  await s.service.stageRelease(await documented(s.root, "1.0.0"), center("1.0.0"));
  await s.restart();
  expect(await readFile(path.join(s.directory, id, "README.md"), "utf8")).toBe("# 更新测试");
  expect((await discoverPlugins(s.directory, "0.58.0")).entries[0].artifact).toBeDefined();
});

it("中心来源在提交后记录，恢复上一版保留来源，本地 ZIP 更新清除来源", async () => {
  const s = await setup();
  await s.service.stageRelease(await documented(s.root, "1.0.0"), center("1.0.0"));
  expect((await s.service.sources([id]))[id]).toEqual({ kind: "zip" });
  await s.restart();
  expect((await s.service.sources([id]))[id]).toEqual(center("1.0.0"));
  await s.service.stageRelease(await documented(s.root, "1.1.0"), center("1.1.0"));
  await s.restart();
  await s.service.restore(id);
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
  expect((await s.service.sources([id]))[id]).toEqual(center("1.1.0"));
  await s.service.stageZip(await zip(s.root, "1.2.0"));
  await s.restart();
  expect((await s.service.sources([id]))[id]).toEqual({ kind: "zip" });
});

it("提交后中断恢复时补写中心来源", async () => {
  const s = await setup();
  await s.service.stageRelease(await documented(s.root, "1.0.0"), center("1.0.0"));
  const transaction = path.join(s.root, "plugin-updates/transactions", id);
  await rename(path.join(s.root, "plugin-updates/pending", id), transaction);
  const recordPath = path.join(transaction, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await rename(path.join(transaction, "package"), path.join(s.directory, id));
  await writeFile(recordPath, JSON.stringify({ ...record, phase: "committed" }));
  await s.restart();
  expect((await s.service.sources([id]))[id]).toEqual(center("1.0.0"));
});

it("下载包与发布记录身份不符时不暂存", async () => {
  const s = await setup();
  await expect(
    s.service.stageRelease(await documented(s.root, "1.0.0"), center("1.0.1"))
  ).rejects.toThrow("不一致");
  expect(await s.service.list()).toEqual([]);
});

it("卸载移除包、备份、待更新与来源，有未完成事务时拒绝", async () => {
  const s = await setup();
  await s.service.stageRelease(await documented(s.root, "1.0.0"), center("1.0.0"));
  await s.restart();
  await s.service.stageRelease(await documented(s.root, "1.1.0"), center("1.1.0"));
  await s.restart();
  await s.service.stageZip(await zip(s.root, "1.2.0"));
  await s.service.uninstall(id);
  expect((await discoverPlugins(s.directory)).entries).toEqual([]);
  expect(await s.service.list()).toEqual([]);
  expect((await s.service.sources([id]))[id]).toEqual({ kind: "zip" });
  await mkdir(path.join(s.root, "plugin-updates/transactions", id));
  await expect(s.service.uninstall(id)).rejects.toThrow("未完成的更新");
  await expect(s.service.uninstall("core.theme")).rejects.toThrow("内置");
});
