import { webcrypto, createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { portableSharedPluginModules as sharedPluginModules } from "@tau/plugins/portable-shared-modules";
import { portableFixtures } from "../../../../../tests/fixtures/plugins/portable.mjs";
import { MobilePluginRuntime } from "./runtime";
import { mobileContentPlugins, mobilePluginElementSupport } from "./content";
import { getMobileContentKit, getMobileFlashcardKit } from "../../services/editorKit";
import { mobileMarkdown } from "../../services/editorMarkdown";

const environment = (platform: "android" | "ios") =>
  createPluginEnvironmentStore({
    platform,
    layout: "compact",
    input: { touch: true, finePointer: false },
    capabilities: [
      "commands.v1",
      "storage.v1",
      "pages.v1",
      "navigation.v1",
      "settings.v1",
      "ui.dialog.v1",
      "editor.elements.v1",
      "editor.codecs.v1",
      "editor.source.v1",
    ],
  });
afterEach(() => {
  vi.unstubAllGlobals();
  mobileContentPlugins.install([]);
  mobilePluginElementSupport.clear();
});
it.each(["android", "ios"] as const)(
  "%s 使用同一模板和 ABC，真实宿主注册、正文/codec 装配与清理",
  async platform => {
    vi.stubGlobal("crypto", webcrypto);
    const artifacts = await portableFixtures();
    const push = vi.fn();
    const runtime = new MobilePluginRuntime(
      environment(platform),
      createMemoryStorage(),
      "A",
      {
        push,
      },
      "0.2.0"
    );
    try {
      await runtime.start(
        artifacts.map(artifact => ({ id: artifact.manifest.id, artifact, enabled: true })),
        sharedPluginModules
      );
      expect([...runtime.errors]).toEqual([]);
      const entry = [...runtime.entries.values()][0];
      await entry.definition.page.open({ count: 3 });
      expect(push).toHaveBeenCalledWith("pluginPage", {
        id: "example.external-counter:counter",
        instance: "single",
        params: '{"count":3}',
      });
      const previous = getMobileContentKit();
      mobileContentPlugins.install(runtime.content.list());
      runtime.elementSupport.forEach((value, key) => mobilePluginElementSupport.set(key, value));
      expect(getMobileContentKit()).not.toBe(previous);
      expect(getMobileContentKit().elementTypes).toContain("abc");
      expect(getMobileFlashcardKit().elementTypes).not.toContain("abc");
      const nodes = mobileMarkdown.importFromMarkdown("```abc\nX:1\nK:C\nC D E F |\n```");
      expect(nodes[0].type).toBe("abc");
      expect(mobileMarkdown.getMarkdown(nodes)).toContain("C D E F |");
      await entry.context.storage.set("count", 3);
      expect(await entry.context.storage.get("count")).toBe(3);
      await runtime.dispose();
      await expect(entry.definition.page.open()).rejects.toThrow();
      expect(runtime.entries.size).toBe(0);
      expect(runtime.settings.size).toBe(0);
    } finally {
      await runtime.dispose();
    }
  }
);
it("render 不提供插入入口，none 保留未知节点；重新装配相同 ID 不命中旧 Kit", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const [, abc] = await portableFixtures();
  const iosTarget = abc.manifest.targets.ios;
  if (!iosTarget) throw new Error("测试包缺少 iOS 目标");
  for (const level of ["render", "none"] as const) {
    const runtime = new MobilePluginRuntime(
      environment("ios"),
      createMemoryStorage(),
      "A",
      {
        push: vi.fn(),
      },
      "0.2.0"
    );
    const artifact = {
      ...abc,
      manifest: {
        ...abc.manifest,
        targets: { ios: { ...iosTarget, elements: { abc: level } } },
      },
    };
    try {
      await runtime.start([{ id: "tau.abc", artifact, enabled: true }], sharedPluginModules);
      expect([...runtime.errors]).toEqual([]);
      expect(runtime.content.extensions.every(extension => !extension.blockPanel)).toBe(true);
      mobileContentPlugins.install(runtime.content.list());
      runtime.elementSupport.forEach((value, key) => mobilePluginElementSupport.set(key, value));
      expect(getMobileContentKit().elementTypes.includes("abc")).toBe(level === "render");
    } finally {
      await runtime.dispose();
    }
  }
});

it("激活尚未成功时不能打开页面，失败不留下导航副作用", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const [base] = await portableFixtures();
  const code = `module.exports.default = require('@tau/plugins').definePlugin({id:${JSON.stringify(base.manifest.id)},name:${JSON.stringify(base.manifest.name)},version:${JSON.stringify(base.manifest.version)},create:()=>({async activate(ctx){const page=ctx.pages.register({id:'early',title:'尚未启用',component:()=>null});await page.open();}})});`;
  const artifact = {
    ...base,
    code,
    manifest: {
      ...base.manifest,
      integrity: {
        ...base.manifest.integrity,
        [base.manifest.main]: createHash("sha256").update(code).digest("hex"),
      },
    },
  };
  const push = vi.fn();
  const runtime = new MobilePluginRuntime(
    environment("android"),
    createMemoryStorage(),
    "A",
    { push },
    "0.2.0"
  );
  try {
    await runtime.start(
      [{ id: artifact.manifest.id, artifact, enabled: true }],
      sharedPluginModules
    );
    expect(runtime.errors.get(artifact.manifest.id)).toContain("不可用");
    expect(push).not.toHaveBeenCalled();
    expect(runtime.pages.size).toBe(0);
  } finally {
    await runtime.dispose();
  }
});
