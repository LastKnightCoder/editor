// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { afterEach, expect, it } from "vitest";
import { PluginUpdates } from "../plugin-updates";
import { readPluginPackage } from "../plugin-package";
import {
  assertDesktopPackageSource,
  readDesktopPluginManifest,
} from "../../../../shared/plugin-package";
import type { LocalPluginSource } from "@/types/plugin-local";

const roots: string[] = [];
const id = "test.portable";
const origin = "https://plugins-api.taunote.app";
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
function bundle(
  version: string,
  options: { required?: string[]; minimum?: string; androidOnly?: boolean } = {}
) {
  const code = "throw new Error('静态安装与扫描不能执行插件代码')";
  const manifest = {
    id,
    name: "跨端测试",
    description: "测试",
    version,
    formatVersion: 3 as const,
    apiVersion: 1 as const,
    platform: "portable" as const,
    profile: "web-v1" as const,
    format: "cjs" as const,
    main: "main.js",
    editor: true as const,
    targets: {
      ...(!options.androidOnly
        ? {
            desktop: {
              minAppVersion: options.minimum ?? "0.59.1",
              required: options.required ?? ["editor"],
              optional: [],
              elements: { abc: "edit" as const },
            },
          }
        : {}),
      android: {
        minAppVersion: "0.2.2",
        required: ["editor"],
        optional: [],
        elements: { abc: "edit" as const },
      },
    },
    integrity: { "main.js": hash(code) },
  };
  const zip = new AdmZip();
  zip.addFile(`${id}/manifest.json`, Buffer.from(JSON.stringify(manifest)));
  zip.addFile(`${id}/main.js`, Buffer.from(code));
  const bytes = zip.toBuffer();
  const source: Extract<LocalPluginSource, { kind: "center" }> = {
    kind: "center",
    releaseId: `release-${version}`,
    pluginId: id,
    version,
    sha256: hash(bytes),
    manifest,
    apiOrigin: origin,
  };
  return { manifest, bytes, source };
}
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "tau-portable-install-"));
  roots.push(root);
  const directory = path.join(root, "plugins");
  const create = async () => {
    const service = new PluginUpdates(directory, "0.59.1", { portableCenterOrigin: origin });
    await service.initialize();
    return service;
  };
  return { root, directory, create, service: await create() };
}
it("格式 3 复用正式安装、扫描、待重启更新和备份恢复，原始清单不降为旧格式", async () => {
  const s = await setup();
  const first = bundle("1.0.0");
  await s.service.stageRelease(first.bytes, first.source);
  await s.service.apply(id, async () => true);
  expect(
    (await readPluginPackage(path.join(s.directory, id), "0.59.1")).manifest.formatVersion
  ).toBe(3);
  const second = bundle("1.1.0");
  await s.service.stageRelease(second.bytes, second.source);
  await s.service.apply(id, async () => false);
  expect((await s.service.list())[0].pendingVersion).toBe("1.1.0");
  const restarted = await s.create();
  expect((await readPluginPackage(path.join(s.directory, id), "0.59.1")).manifest.version).toBe(
    "1.1.0"
  );
  await restarted.restore(id);
  const restored = await s.create();
  expect((await readPluginPackage(path.join(s.directory, id), "0.59.1")).manifest.version).toBe(
    "1.0.0"
  );
  expect((await restored.sources([id]))[id]).toEqual(first.source);
  await rm(path.join(s.root, "plugin-updates/backup-sources", `${id}.json`));
  await expect(restored.restore(id)).rejects.toThrow("固定插件中心");
});
it("错误平台、最低版本、未知必需能力及发布清单/摘要不符均拒绝", async () => {
  const s = await setup();
  for (const options of [
    { androidOnly: true },
    { minimum: "99.0.0" },
    { required: ["future.v1"] },
  ]) {
    const item = bundle("1.0.0", options);
    await expect(s.service.stageRelease(item.bytes, item.source)).rejects.toThrow();
  }
  const item = bundle("1.0.0");
  await expect(
    s.service.stageRelease(item.bytes, { ...item.source, sha256: "a".repeat(64) })
  ).rejects.toThrow("摘要");
  await expect(
    s.service.stageRelease(item.bytes, { ...item.source, manifest: undefined })
  ).rejects.toThrow("清单");
});
it("待生效包清单被改动时不替换当前版本", async () => {
  const s = await setup();
  const first = bundle("1.0.0"),
    next = bundle("1.1.0");
  await s.service.stageRelease(first.bytes, first.source);
  await s.service.apply(id, async () => true);
  await s.service.stageRelease(next.bytes, next.source);
  const file = path.join(s.root, "plugin-updates/pending", id, "package/manifest.json");
  const changed = JSON.parse(await readFile(file, "utf8"));
  changed.targets.desktop.optional = ["dialogs"];
  await writeFile(file, JSON.stringify(changed));
  await s.create();
  expect((await readPluginPackage(path.join(s.directory, id), "0.59.1")).manifest.version).toBe(
    "1.0.0"
  );
});
it("正式模式拒绝调试来源、错中心和丢失来源，开发模式仍能验证隔离包", () => {
  const item = bundle("1.0.0");
  const manifest = readDesktopPluginManifest(item.manifest);
  expect(() => assertDesktopPackageSource(manifest, item.source, origin, true)).not.toThrow();
  for (const source of [
    undefined,
    { kind: "zip" },
    { ...item.source, apiOrigin: "https://other.example" },
  ])
    expect(() => assertDesktopPackageSource(manifest, source, origin, true)).toThrow(
      "固定插件中心"
    );
  expect(() => assertDesktopPackageSource(manifest, { kind: "zip" }, origin, false)).not.toThrow();
});
