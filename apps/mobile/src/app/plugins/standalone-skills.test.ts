// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { AiSkillRegistry, type AiSkillSource } from "@tau/ai/skills";
import { MobilePluginRuntime } from "./runtime";
import { createMobilePluginAiSkills } from "./ai-skills";
import type { MobilePluginArtifact, MobilePluginPackage } from "../../services/plugins";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  vi.resetAllMocks();
});
const id = "fixture.summary";
const body = "---\nname: summary\ndescription: 整理行动项\n---\n先读取卡片，再整理行动项。";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const integrity = {
  "skills/summary/SKILL.md": digest(body),
  "skills/summary/scripts/retained.js": digest("throw new Error('不能执行脚本')"),
};
const standalone = (): MobilePluginArtifact => ({
  kind: "skills",
  manifest: {
    id,
    name: "行动项技能",
    version: "1.0.0",
    formatVersion: 1,
    apiVersion: 1,
    platform: "portable",
    targets: { android: { minAppVersion: "0.2.13" }, ios: { minAppVersion: "0.2.13" } },
    skills: ["summary"],
    integrity,
  },
});
function application(): MobilePluginArtifact {
  const code = `module.exports.default=require('@tau/plugins').definePlugin({id:'${id}',name:'应用插件',version:'1.0.0',create:()=>({activate(){}})});`;
  return {
    kind: "plugin",
    code,
    manifest: {
      id,
      name: "应用插件",
      version: "1.0.0",
      formatVersion: 3,
      apiVersion: 1,
      platform: "portable",
      profile: "web-v1",
      format: "cjs",
      main: "main.js",
      targets: { ios: { minAppVersion: "0.2.13" } },
      skills: ["summary"],
      integrity: { "skills/summary/SKILL.md": digest(body), "main.js": digest(code) },
    },
  };
}
const installed = (
  artifact = standalone(),
  patch: Partial<MobilePluginPackage> = {}
): MobilePluginPackage => ({
  id,
  enabled: true,
  artifact,
  skillRevision: "installed-revision",
  ...patch,
});
let sourceKind: "skills" | "plugin" = "skills";
function harness() {
  const runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "ios",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "one.db",
    { push: vi.fn() },
    "0.2.13"
  );
  const registry = new AiSkillRegistry();
  const sources: AiSkillSource[] = [];
  invoke.mockImplementation(async (command, args) => {
    if (command === "plugin_ai_skill_sources")
      return [
        {
          kind: sourceKind,
          pluginId: id,
          pluginName: "行动项",
          version: "1.0.0",
          revision: "installed-revision",
          entries: [{ id: "summary", path: "skills/summary/SKILL.md" }],
        },
      ];
    if (command === "plugin_ai_skill_read") {
      const bytes = new TextEncoder().encode(body);
      return {
        data: btoa(String.fromCharCode(...bytes.slice(args.offset))),
        nextOffset: bytes.length,
        eof: true,
      };
    }
    throw new Error(`未预期命令：${command}`);
  });
  runtime.aiSkills = createMobilePluginAiSkills("one.db", "workspace-token", {
    getActivePackages: () => runtime.getActiveAiPackages(),
    subscribe: runtime.subscribe,
    registerSource(source) {
      sources.push(source);
      return registry.registerSource(source);
    },
    onError: vi.fn(),
  });
  cleanup.push(() => runtime.dispose());
  return { runtime, registry, sources };
}

it("独立包进入技能目录但不求值JS、不注册PluginHost，脚本仅保留清单", async () => {
  sourceKind = "skills";
  const { runtime, registry } = harness();
  await runtime.start([installed()], {});
  expect(runtime.host.listPlugins()).toHaveLength(0);
  expect(runtime.content.list()).toHaveLength(0);
  expect([...runtime.errors]).toEqual([]);
  expect(runtime.isPluginActive(id)).toBe(false);
  expect(runtime.isSkillPackageActive(id)).toBe(true);
  expect((await registry.list()).map(skill => skill.id)).toEqual([`${id}:summary`]);
  expect((await registry.load(`${id}:summary`)).instructions).toContain("先读取卡片");
  const snapshot = await registry.captureAvailable();
  await expect(snapshot.readResource(`${id}:summary`, "scripts/retained.js")).rejects.toMatchObject(
    { code: "AI_SKILL_SCRIPT_UNSUPPORTED" }
  );
});

it("首次安装没有管理页消费者时，也通过库存协调进入与重载相同目录", async () => {
  sourceKind = "skills";
  const first = harness();
  await first.runtime.start([], {});
  await first.runtime.reconcileSkillPackages([installed()]);
  expect((await first.registry.list()).map(skill => skill.id)).toEqual([`${id}:summary`]);
  const old = await first.registry.captureAvailable();
  await first.runtime.dispose();
  expect(old.isCurrent()).toBe(false);
  const second = harness();
  await second.runtime.start([installed()], {});
  expect((await second.registry.list()).map(skill => skill.id)).toEqual([`${id}:summary`]);
});

it("停用、卸载与重新启用按新来源代次处理，旧context不能重新取得资格", async () => {
  sourceKind = "skills";
  const { runtime, registry, sources } = harness();
  await runtime.start([installed()], {});
  const old = await registry.captureAvailable();
  const original = sources[0];
  runtime.revokeSkillPackage(id);
  expect(old.isCurrent()).toBe(false);
  await runtime.reconcileSkillPackages([installed(undefined, { enabled: false })]);
  expect(await registry.list()).toEqual([]);
  await runtime.reconcileSkillPackages([installed()]);
  expect(await registry.list()).toHaveLength(1);
  await expect(original.read("skills/summary/SKILL.md")).rejects.toMatchObject({
    code: "AI_SKILL_UNAVAILABLE",
  });
  await runtime.reconcileSkillPackages([]);
  expect(await registry.list()).toEqual([]);
});

it("safe mode禁止库存协调自动启用，中心撤回立即撤销独立来源", async () => {
  sourceKind = "skills";
  const safe = harness();
  await safe.runtime.start([installed()], {}, undefined, undefined, { safeMode: true });
  await safe.runtime.reconcileSkillPackages([installed()]);
  expect(safe.runtime.getActiveAiPackages()).toEqual([]);
  expect(await safe.registry.list()).toEqual([]);
  const live = harness();
  await live.runtime.start([installed()], {});
  const old = await live.registry.captureAvailable();
  await live.runtime.blockFromCenter(id);
  expect(old.isCurrent()).toBe(false);
  expect(live.runtime.isSkillPackageActive(id)).toBe(false);
});

it("同ID技能包与应用插件转换先撤销旧技能，应用代码只在重载时求值", async () => {
  sourceKind = "skills";
  const first = harness();
  await first.runtime.start([installed()], {});
  const old = await first.registry.captureAvailable();
  await first.runtime.reconcileSkillPackages([installed(application())]);
  expect(old.isCurrent()).toBe(false);
  expect(first.runtime.host.listPlugins()).toHaveLength(0);
  await first.runtime.dispose();
  sourceKind = "plugin";
  const second = harness();
  await second.runtime.start([installed(application())], { "@tau/plugins": { definePlugin } });
  expect(second.runtime.isPluginActive(id)).toBe(true);
  const applicationSource = await second.registry.captureAvailable();
  sourceKind = "skills";
  await second.runtime.reconcileSkillPackages([installed()]);
  expect(applicationSource.isCurrent()).toBe(false);
  expect(second.runtime.isSkillPackageActive(id)).toBe(false);
  expect(await second.registry.list()).toEqual([]);
});
