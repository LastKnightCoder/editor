// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { PluginUpdates } from "../plugin-updates";
import { readDistributionPackage, isSkillPackage } from "../plugin-package";
import { discoverPlugins } from "../plugin-discovery";
import type { LocalPluginSource } from "@/types/plugin-local";

const roots: string[] = [];
const id = "test.skill-package";
const origin = "https://plugins-api.taunote.app";
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function bundle(
  version: string,
  options: { androidOnly?: boolean; minimum?: string; script?: boolean } = {}
) {
  const text = `---\nname: 写作\ndescription: 写作时使用\n---\n版本 ${version}`;
  const script = "throw new Error('安装和扫描不得执行Skill脚本');";
  const manifest = {
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "portable" as const,
    id,
    name: "独立写作技能",
    description: "写作规则",
    version,
    targets: {
      ...(!options.androidOnly ? { desktop: { minAppVersion: options.minimum ?? "0.60.4" } } : {}),
      android: { minAppVersion: "0.2.13" },
    },
    skills: ["writing"],
    integrity: {
      "skills/writing/SKILL.md": hash(text),
      ...(options.script ? { "skills/writing/scripts/run.js": hash(script) } : {}),
    },
  };
  const archive = new AdmZip();
  archive.addFile(`${id}/manifest.json`, Buffer.from(JSON.stringify(manifest)));
  archive.addFile(`${id}/skills/writing/SKILL.md`, Buffer.from(text));
  if (options.script) archive.addFile(`${id}/skills/writing/scripts/run.js`, Buffer.from(script));
  const bytes = archive.toBuffer();
  const source: Extract<LocalPluginSource, { kind: "center" }> = {
    kind: "center",
    pluginId: id,
    releaseId: `release-${version}`,
    version,
    sha256: hash(bytes),
    manifest,
    apiOrigin: origin,
    systemReviewed: options.script === true,
  };
  return { manifest, bytes, source };
}
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "tau-portable-skill-"));
  roots.push(root);
  const directory = path.join(root, "plugins");
  const create = async () => {
    const service = new PluginUpdates(directory, "0.60.4", { portableCenterOrigin: origin });
    await service.initialize();
    return service;
  };
  return { root, directory, create, service: await create() };
}

it("同一跨端独立Skill包在桌面沿用安装、更新、恢复与卸载，不进入代码插件", async () => {
  const s = await setup();
  const first = bundle("1.0.0", { script: true });
  await s.service.stageRelease(first.bytes, first.source);
  await s.service.apply(id, async () => true);
  const read = () => readDistributionPackage(path.join(s.directory, id), "0.60.4");
  expect(isSkillPackage(await read())).toBe(true);
  expect(await read()).not.toHaveProperty("code");
  expect((await discoverPlugins(s.directory, "0.60.4")).entries[0]).toMatchObject({
    skillPackage: { formatVersion: 1, platform: "portable" },
  });
  expect(
    await readFile(path.join(s.directory, id, "skills/writing/scripts/run.js"), "utf8")
  ).toContain("不得执行");
  const second = bundle("1.1.0");
  await s.service.stageRelease(second.bytes, second.source);
  await s.service.apply(id, async () => true);
  expect((await read()).manifest.version).toBe("1.1.0");
  await s.service.restore(id);
  const restored = await s.create();
  expect((await read()).manifest.version).toBe("1.0.0");
  expect((await restored.sources([id]))[id]).toEqual(first.source);
  await restored.uninstall(id);
  expect((await discoverPlugins(s.directory, "0.60.4")).entries).toEqual([]);
});

it("独立Skill仍按targets和最低客户端版本判断平台，不能借formatVersion绕过", async () => {
  const s = await setup();
  const mobile = bundle("1.0.0", { androidOnly: true });
  await expect(s.service.stageRelease(mobile.bytes, mobile.source)).rejects.toThrow("平台");
  const future = bundle("1.0.0", { minimum: "99.0.0" });
  await expect(s.service.stageRelease(future.bytes, future.source)).rejects.toThrow("版本");
});

it("跨端独立包核对固定中心来源、实际ZIP摘要和审批清单", async () => {
  const s = await setup();
  const pack = bundle("1.0.0");
  await expect(
    s.service.stageRelease(pack.bytes, { ...pack.source, sha256: "0".repeat(64) })
  ).rejects.toThrow("摘要");
  await expect(
    s.service.stageRelease(pack.bytes, {
      ...pack.source,
      manifest: { ...pack.manifest, name: "审批后被替换" },
    })
  ).rejects.toThrow("清单");
  await expect(
    s.service.stageRelease(pack.bytes, { ...pack.source, apiOrigin: "https://other.invalid" })
  ).rejects.toThrow("固定插件中心");
});
