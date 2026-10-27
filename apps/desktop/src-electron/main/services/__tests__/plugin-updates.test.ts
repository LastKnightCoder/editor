// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { afterEach, expect, it } from "vitest";
import { PluginUpdates } from "../plugin-updates";
import type { LocalPluginSource } from "@/types/plugin-local";
import { discoverPlugins } from "../plugin-discovery";
import { readTemplatePackage } from "../template-package";

const roots: string[] = [];
const id = "test.update";
it("纯静态模板沿用安装、更新与恢复事务，扫描不登记代码入口", async () => {
  const s = await setup();
  const packageZip = (version: string, bad = false) => {
    const archive = new AdmZip();
    const html = '<meta name="manifest" content="__TAU_MANIFEST__">';
    const manifest = {
      formatVersion: 1,
      apiVersion: 1,
      platform: "desktop",
      id,
      name: "静态模板",
      version,
      template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
      integrity: { "site/index.html": createHash("sha256").update(html).digest("hex") },
    };
    archive.addFile(id + "/manifest.json", Buffer.from(JSON.stringify(manifest)));
    archive.addFile(id + "/site/index.html", Buffer.from(bad ? "tampered" : html));
    archive.addFile(id + "/site/notes.txt", Buffer.from("不参与发布的附带说明"));
    return archive.toBuffer();
  };
  const file = path.join(s.root, "template.zip");
  await writeFile(file, packageZip("1.0.0"));
  await s.service.stageZip(file);
  await s.restart();
  const entry = (await discoverPlugins(s.directory, "0.58.0")).entries[0];
  expect(entry.template?.id).toBe(id);
  expect(entry.artifact).toBeUndefined();
  expect(entry.error).toBeUndefined();
  expect(
    (await readTemplatePackage(path.join(s.directory, id), "0.58.0")).files.map(f => f.path)
  ).toEqual(["index.html"]);
  await writeFile(file, packageZip("1.1.0", true));
  await expect(s.service.stageZip(file)).rejects.toThrow("摘要");
  expect(await s.version()).toBe("1.0.0");
  await writeFile(file, packageZip("1.1.0"));
  await s.service.stageZip(file);
  await s.restart();
  await s.service.restore(id);
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
});
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
    formatVersion: 3,
    apiVersion: 1,
    id,
    name: "更新测试",
    version,
    platform: "portable" as const,
    format: "cjs",
    main: "main.js",
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },

    profile: "web-v1" as const,
    targets: { desktop: { minAppVersion: minimum ?? "0.0.0" } },
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

it("安装与普通更新可以立即提交，同一事务保留备份和取消能力", async () => {
  const s = await setup();
  await s.service.stageZip(await zip(s.root, "1.0.0"));
  expect(await s.service.apply(id, async () => true)).toBe(true);
  expect(await s.version()).toBe("1.0.0");
  expect(await s.service.list()).toEqual([]);
  await s.service.stageZip(await zip(s.root, "1.1.0"));
  expect(await s.service.apply(id, async () => false)).toBe(false);
  expect(await s.version()).toBe("1.0.0");
  expect((await s.service.list())[0].pendingVersion).toBe("1.1.0");
  await s.service.apply(id, async () => true);
  expect(await s.version()).toBe("1.1.0");
  expect((await s.service.list())[0].previousVersion).toBe("1.0.0");
  await s.service.restore(id);
  await s.service.apply(id, async () => true);
  expect(await s.version()).toBe("1.0.0");
});

it("立即提交前发现包损坏时保留旧版本并返回失败", async () => {
  const s = await setup();
  await install(s);
  await s.service.stageZip(await zip(s.root, "1.1.0"));
  await writeFile(path.join(s.root, "plugin-updates/pending", id, "package/main.js"), "broken");
  await expect(s.service.apply(id, async () => true)).rejects.toThrow("产物不完整");
  expect(await s.version()).toBe("1.0.0");
  expect((await s.service.list())[0].error).toContain("产物不完整");
});

it("最低版本、坏哈希、重复更新和非递增版本不覆盖当前包", async () => {
  const s = await setup();
  await install(s);
  await expect(s.service.stageZip(await zip(s.root, "2.0.0", "0.59.0"))).rejects.toThrow(
    "客户端版本低于插件要求"
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
  expect(result.entries[0].error).toContain("客户端版本低于插件要求");
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

type CenterSource = Extract<LocalPluginSource, { kind: "center" }>;
const centerSources = new Map<string, CenterSource>();
const center = (version: string): CenterSource => {
  let source = centerSources.get(version);
  if (!source) {
    source = {
      kind: "center",
      releaseId: `release-${version}`,
      pluginId: id,
      version,
      sha256: "c".repeat(64),
    };
    centerSources.set(version, source);
  }
  return source;
};
afterEach(() => centerSources.clear());
async function stageReviewed(service: PluginUpdates, bytes: Buffer, source: CenterSource) {
  const manifest = JSON.parse(new AdmZip(bytes).readAsText(`${id}/manifest.json`));
  if (manifest.formatVersion === 3)
    Object.assign(source, {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      manifest,
      apiOrigin: "https://plugins-api.taunote.app",
    });
  return service.stageRelease(bytes, source);
}
async function documented(root: string, version: string, extra?: string) {
  const archive = new AdmZip(await zip(root, version));
  archive.addFile(id + "/README.md", Buffer.from("# 更新测试"));
  archive.addFile(id + "/CHANGELOG.md", Buffer.from("## " + version));
  archive.addFile(id + "/LICENSE", Buffer.from("MIT"));
  if (extra) archive.addFile(id + "/" + extra, Buffer.from("x"));
  return archive.toBuffer();
}

it.each(["center", "zip"])("%s 安装允许额外普通文件，保存但不执行", async source => {
  const s = await setup();
  const archive = new AdmZip(await documented(s.root, "1.0.0", "THIRD_PARTY_NOTICES.md"));
  archive.addFile(id + "/", Buffer.alloc(0));
  archive.addFile(id + "/docs/", Buffer.alloc(0));
  archive.addFile(id + "/docs/notes.txt", Buffer.from("附带说明"));
  archive.addFile(id + "/unused.js", Buffer.from("throw new Error('不能自动执行');"));
  if (source === "center") {
    await stageReviewed(s.service, archive.toBuffer(), center("1.0.0"));
  } else {
    const file = path.join(s.root, "extra.zip");
    await writeFile(file, archive.toBuffer());
    await s.service.stageZip(file);
  }
  await s.restart();
  expect(await readFile(path.join(s.directory, id, "README.md"), "utf8")).toBe("# 更新测试");
  expect(await readFile(path.join(s.directory, id, "THIRD_PARTY_NOTICES.md"), "utf8")).toBe("x");
  expect(await readFile(path.join(s.directory, id, "docs/notes.txt"), "utf8")).toBe("附带说明");
  expect((await discoverPlugins(s.directory, "0.58.0")).entries[0].artifact).toBeDefined();
});

it.each([
  "../outside.txt",
  "/outside.txt",
  "other.plugin/notes.txt",
  `${id}/../outside.txt`,
  `${id}/docs/../../outside.txt`,
  `${id}/docs\\outside.txt`,
  `${id}/docs//notes.txt`,
  `${id}/./notes.txt`,
  `${id}/main.js:stream`,
  `${id}/main.js.`,
  `${id}/main.js `,
  `${id}/NUL.txt`,
  `${id}/notes\0.txt`,
  `${id}/main.js`,
  `${id}/MAIN.JS`,
  `${id}/manifest.json`,
  `${id}/main.js/notes.txt`,
  `${id}/main.js/`,
])("额外条目不能越界或覆盖已有文件：%s", async name => {
  const s = await setup();
  await install(s);
  const archive = new AdmZip(await documented(s.root, "1.1.0", "notes.txt"));
  // 直接改条目名，避免 ZIP 写入库预先规范化危险路径或合并重名文件。
  const entry = archive.getEntry(`${id}/notes.txt`);
  if (!entry) throw new Error("测试包缺少附带文件");
  entry.entryName = name;
  await expect(stageReviewed(s.service, archive.toBuffer(), center("1.1.0"))).rejects.toThrow();
  expect(await s.version()).toBe("1.0.0");
  expect(await s.service.list()).toEqual([]);
  expect(await readdir(path.join(s.root, "plugin-updates/pending"))).toEqual([]);
});

it.each(["notes.txt", "docs/"])("额外符号链接拒绝安装：%s", async name => {
  const s = await setup();
  const archive = new AdmZip(await documented(s.root, "1.0.0", name));
  const entry = archive.getEntry(`${id}/${name}`);
  if (!entry) throw new Error("测试包缺少链接条目");
  entry.attr = (0xa1ff << 16) >>> 0;
  await expect(stageReviewed(s.service, archive.toBuffer(), center("1.0.0"))).rejects.toThrow(
    "链接"
  );
});

it.each(["missing", "corrupt"])("额外文件不绕过必需资源校验：%s", async fault => {
  const s = await setup();
  const archive = new AdmZip(await documented(s.root, "1.0.0", "notes.txt"));
  if (fault === "missing") archive.deleteFile(`${id}/main.js`);
  else archive.updateFile(`${id}/main.js`, Buffer.from("损坏的入口"));
  await expect(stageReviewed(s.service, archive.toBuffer(), center("1.0.0"))).rejects.toThrow();
  expect(await s.service.list()).toEqual([]);
});

it("中心来源与包一起恢复到上一版，本地 ZIP 更新清除来源", async () => {
  const s = await setup();
  await stageReviewed(s.service, await documented(s.root, "1.0.0"), center("1.0.0"));
  expect((await s.service.sources([id]))[id]).toEqual({ kind: "zip" });
  await s.restart();
  expect((await s.service.sources([id]))[id]).toEqual(center("1.0.0"));
  await stageReviewed(s.service, await documented(s.root, "1.1.0"), center("1.1.0"));
  await s.restart();
  await s.service.restore(id);
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
  expect((await s.service.sources([id]))[id]).toEqual(center("1.0.0"));
  await s.service.stageZip(await zip(s.root, "1.2.0"));
  await s.restart();
  expect((await s.service.sources([id]))[id]).toEqual({ kind: "zip" });
});

it("提交后中断恢复时补写中心来源", async () => {
  const s = await setup();
  await stageReviewed(s.service, await documented(s.root, "1.0.0"), center("1.0.0"));
  const transaction = path.join(s.root, "plugin-updates/transactions", id);
  await rename(path.join(s.root, "plugin-updates/pending", id), transaction);
  const recordPath = path.join(transaction, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await rename(path.join(transaction, "package"), path.join(s.directory, id));
  await writeFile(recordPath, JSON.stringify({ ...record, phase: "committed" }));
  await s.restart();
  expect((await s.service.sources([id]))[id]).toEqual(center("1.0.0"));
});

it("后台更新提交后中断仍能恢复备份审核来源，来源缺失的后台备份不能降为本地信任", async () => {
  const s = await setup();
  const native = async (version: string) => {
    const archive = new AdmZip(await zip(s.root, version, "0.58.0"));
    const manifest = JSON.parse(archive.readAsText(`${id}/manifest.json`));
    const backend = "throw new Error('不得执行备份')";
    archive.addFile(`${id}/backend.js`, Buffer.from(backend));
    archive.updateFile(
      `${id}/manifest.json`,
      Buffer.from(
        JSON.stringify({
          ...manifest,
          formatVersion: 2,
          platform: "desktop",
          minAppVersion: "0.0.0",
          backend: {
            entry: "backend.js",
            runtime: "node",
            apiVersion: 1,
            scope: "application",
            activation: "app-ready",
            lifetime: "persistent",
            reason: "测试回滚",
            systemAccess: [],
          },
          integrity: {
            ...manifest.integrity,
            "backend.js": createHash("sha256").update(backend).digest("hex"),
          },
        })
      )
    );
    return archive.toBuffer();
  };
  const first = { ...center("1.0.0"), systemReviewed: true };
  await stageReviewed(s.service, await native("1.0.0"), first);
  await s.restart();
  await stageReviewed(s.service, await native("1.1.0"), {
    ...center("1.1.0"),
    systemReviewed: true,
  });
  const transaction = path.join(s.root, "plugin-updates/transactions", id);
  await rename(path.join(s.root, "plugin-updates/pending", id), transaction);
  const recordPath = path.join(transaction, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await rename(path.join(s.directory, id), path.join(s.root, "plugin-updates/backups", id));
  await rename(path.join(transaction, "package"), path.join(s.directory, id));
  await writeFile(recordPath, JSON.stringify({ ...record, phase: "committed" }));
  await s.restart();
  await s.service.restore(id);
  await s.restart();
  expect(await s.version()).toBe("1.0.0");
  expect((await s.service.sources([id]))[id]).toEqual(first);
  await rm(path.join(s.root, "plugin-updates/backup-sources", `${id}.json`));
  await expect(s.service.restore(id)).rejects.toThrow("缺少原版本来源");
});

it("下载包与发布记录身份不符时不暂存", async () => {
  const s = await setup();
  await expect(
    stageReviewed(s.service, await documented(s.root, "1.0.0"), center("1.0.1"))
  ).rejects.toThrow("不一致");
  expect(await s.service.list()).toEqual([]);
});

it("卸载移除包、备份、待更新与来源，有未完成事务时拒绝", async () => {
  const s = await setup();
  await stageReviewed(s.service, await documented(s.root, "1.0.0"), center("1.0.0"));
  await s.restart();
  await stageReviewed(s.service, await documented(s.root, "1.1.0"), center("1.1.0"));
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

it("启动时移除当前客户端读不了的旧格式备份，不再报清单损坏", async () => {
  const s = await setup();
  await install(s, "1.0.0");
  await s.service.stageZip(await zip(s.root, "1.1.0"));
  await s.restart();
  const backup = path.join(s.root, "plugin-updates/backups", id);
  const manifest = JSON.parse(await readFile(path.join(backup, "manifest.json"), "utf8"));
  await writeFile(
    path.join(backup, "manifest.json"),
    JSON.stringify({ ...manifest, formatVersion: 1, platform: "desktop" })
  );
  await writeFile(path.join(s.root, "plugin-updates/backup-sources", `${id}.json`), "{}");
  const next = await s.restart();
  expect(await next.list()).toEqual([]);
  expect(await readdir(path.join(s.root, "plugin-updates/backup-sources"))).toEqual([]);
  expect(await s.version()).toBe("1.1.0");
});
