// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import { PluginUpdates } from "../plugin-updates";
import {
  LegacyPluginUpgrade,
  LEGACY_PLUGIN_UPGRADE_VERSIONS,
  waitForLegacyPluginUpgrade,
} from "../legacy-plugin-upgrade";
import {
  assertLegacyPluginStartupReady,
  setLegacyPluginStartupErrors,
} from "../plugin-content-artifacts";
import type { PluginCatalog, PluginCatalogEntry } from "@/types/plugin-center";
import type { LocalPluginSource } from "@/types/plugin-local";

vi.mock("electron", () => ({ app: { isPackaged: true }, net: { fetch: vi.fn() } }));
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
function artifact(id: string, version: string) {
  const code = "throw new Error('主进程只校验，不执行插件代码');";
  const manifest = {
    formatVersion: 1,
    apiVersion: 1,
    id,
    name: id,
    version,
    platform: "desktop",
    format: "cjs",
    main: "main.js",
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
  };
  const zip = new AdmZip();
  zip.addFile(`${id}/manifest.json`, Buffer.from(JSON.stringify(manifest)));
  zip.addFile(`${id}/main.js`, Buffer.from(code));
  const bytes = zip.toBuffer(),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  const source: Extract<LocalPluginSource, { kind: "center" }> = {
    kind: "center",
    releaseId: id.replaceAll(".", "-") + "-release",
    pluginId: id,
    version,
    sha256,
    apiOrigin: "https://plugins-api.taunote.app",
  };
  const compatible = {
    releaseId: source.releaseId,
    version,
    sha256,
    minAppVersion: "0.0.0",
    publishedAt: "",
    size: bytes.length,
    downloadUrl: "",
  };
  const entry: PluginCatalogEntry = {
    pluginId: id,
    name: id,
    description: "",
    publisher: { login: "tau", avatarUrl: "" },
    repository: "",
    downloadsTotal: 0,
    downloads7d: 0,
    latest: compatible,
    compatible,
  };
  return { manifest, code, bytes, source, entry };
}
async function setup(installed: Record<string, string> = { "tau.html": "0.1.5" }) {
  const root = await mkdtemp(path.join(tmpdir(), "tau-legacy-plugins-"));
  roots.push(root);
  const directory = path.join(root, "plugins");
  for (const [id, version] of Object.entries(installed)) {
    const pkg = artifact(id, version);
    await mkdir(path.join(directory, id), { recursive: true });
    await writeFile(path.join(directory, id, "manifest.json"), JSON.stringify(pkg.manifest));
    await writeFile(path.join(directory, id, "main.js"), pkg.code);
  }
  const preferences = new LocalPluginPreferences(directory);
  await preferences.load();
  const updates = new PluginUpdates(directory, "0.60.0");
  const packages = [
    "tau.html",
    "tau.image-gallery",
    "tau.abc",
    "tau.custom-block",
    "taunote.stickman",
    "tau.tikz",
    "tau.typst",
  ].map(id => artifact(id, LEGACY_PLUGIN_UPGRADE_VERSIONS[id]));
  const catalog = vi.fn(async (): Promise<PluginCatalog> => ({
    items: packages.map(pkg => pkg.entry),
  }));
  const download = vi.fn(async (id: string) => {
    const pkg = packages.find(pkg => pkg.source.releaseId === id);
    if (!pkg) throw new Error("测试版本不存在");
    return { bytes: pkg.bytes, source: pkg.source };
  });
  const center = { catalog, download },
    upgrade = new LegacyPluginUpgrade(updates, preferences, center);
  const version = async (id: string) =>
    JSON.parse(await readFile(path.join(directory, id, "manifest.json"), "utf8")).version;
  return { root, directory, preferences, updates, center, upgrade, version, packages };
}
it("自动更新已装插件并补装旧内置图集，保留旧包、来源和用户停用状态", async () => {
  const f = await setup();
  await f.preferences.set("tau.html", false);
  await f.upgrade.run();
  expect(await f.version("tau.html")).toBe("0.1.10");
  expect(await f.version("tau.image-gallery")).toBe("0.1.6");
  expect(f.preferences.enabled("tau.html", true)).toBe(false);
  expect(f.preferences.enabled("tau.image-gallery", false)).toBe(true);
  expect((await f.updates.list()).find(item => item.id === "tau.html")?.previousVersion).toBe(
    "0.1.5"
  );
  expect((await f.updates.sources(["tau.html"]))["tau.html"]).toMatchObject({
    kind: "center",
    version: "0.1.10",
  });
  f.center.catalog.mockClear();
  f.center.download.mockClear();
  await f.upgrade.run();
  expect(f.center.catalog).not.toHaveBeenCalled();
  expect(f.center.download).not.toHaveBeenCalled();
});
it("下载失败保留原插件，后台重试成功之前不放行内容启动", async () => {
  const f = await setup();
  f.center.download.mockRejectedValueOnce(new Error("网络断开"));
  const failed = vi.fn(),
    ready = vi.fn(),
    wait = vi.fn(async () => {
      expect(await f.version("tau.html")).toBe("0.1.5");
      expect(ready).not.toHaveBeenCalled();
    });
  await waitForLegacyPluginUpgrade(f.upgrade, failed, wait).then(ready);
  expect(failed).toHaveBeenCalledOnce();
  expect(wait).toHaveBeenCalledOnce();
  expect(ready).toHaveBeenCalledOnce();
  expect(await f.version("tau.html")).toBe("0.1.10");
});
it.each(["before", "after"] as const)(
  "%s 安装阶段退出后按耐久包状态续做，不重复下载已完成插件",
  async phase => {
    const f = await setup({ "tau.html": "0.1.5", "tau.image-gallery": "0.1.6" });
    const apply = f.updates.apply.bind(f.updates);
    vi.spyOn(f.updates, "apply").mockImplementationOnce(async (...args) => {
      if (phase === "after") await apply(...args);
      throw new Error("进程退出");
    });
    await expect(f.upgrade.run()).rejects.toThrow("进程退出");
    const reopened = new PluginUpdates(f.directory, "0.60.0"),
      preferences = new LocalPluginPreferences(f.directory);
    await preferences.load();
    f.center.catalog.mockClear();
    f.center.download.mockClear();
    await new LegacyPluginUpgrade(reopened, preferences, f.center).run();
    expect(await f.version("tau.html")).toBe("0.1.10");
    expect(f.center.download.mock.calls.some(([id]) => id === "tau-html-release")).toBe(false);
    expect((await reopened.list()).find(item => item.id === "tau.html")?.previousVersion).toBe(
      "0.1.5"
    );
    expect(preferences.enabled("tau.image-gallery", false)).toBe(true);
  }
);
it("没有达到升级下限的兼容发布版本时保留原包，不把旧插件当成功", async () => {
  const f = await setup();
  f.center.catalog.mockResolvedValue({ items: [artifact("tau.html", "0.1.6").entry] });
  await expect(f.upgrade.run()).rejects.toThrow("所需的兼容版本");
  expect(await f.version("tau.html")).toBe("0.1.5");
  expect(f.center.download).not.toHaveBeenCalled();
});
it("下载版本或摘要与选版不一致时拒绝安装", async () => {
  const f = await setup();
  const pkg = f.packages[0];
  f.center.download.mockResolvedValue({
    bytes: pkg.bytes,
    source: { ...pkg.source, sha256: "0".repeat(64) },
  });
  await expect(f.upgrade.run()).rejects.toThrow("选定版本不一致");
  expect(await f.version("tau.html")).toBe("0.1.5");
});
it("已达到下限可离线启动且不降级，保留图集显式停用", async () => {
  const f = await setup({ ...LEGACY_PLUGIN_UPGRADE_VERSIONS, "tau.html": "9.0.0" });
  await f.preferences.set("tau.image-gallery", false);
  await f.upgrade.run();
  expect(f.center.catalog).not.toHaveBeenCalled();
  expect(await f.version("tau.html")).toBe("9.0.0");
  expect(f.preferences.enabled("tau.image-gallery", true)).toBe(false);
});
it("新安装和仓库外插件不触发一次性自动安装", async () => {
  for (const installed of [{}, { "example.external": "1.0.0" }] as Record<string, string>[]) {
    const f = await setup(installed);
    await f.upgrade.run();
    expect(f.center.catalog).not.toHaveBeenCalled();
  }
});
it("插件包已更新但定义加载失败时仍不放行正文和白板转换", () => {
  setLegacyPluginStartupErrors({ "tau.html": "定义损坏" });
  expect(assertLegacyPluginStartupReady).toThrow("暂不转换原内容");
  setLegacyPluginStartupErrors({});
  expect(assertLegacyPluginStartupReady).not.toThrow();
});

it("有旧资料库但从未安装内容插件时仍自动补齐，不漏掉旧内置节点", async () => {
  const f = await setup({});
  await writeFile(path.join(f.root, "data.db"), "旧资料库占位");
  await f.upgrade.run();
  expect(await f.version("tau.image-gallery")).toBe("0.1.6");
  expect(await f.version("tau.html")).toBe("0.1.10");
  expect(f.center.download).toHaveBeenCalledTimes(7);
});
