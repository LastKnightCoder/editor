import { transferableAbortController } from "node:util";
import { definePlugin, type PluginContext, type UploadFile, type JsonValue } from "@tau/plugins";
import { setMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import type { SettingCompat } from "../../types";
import { webcrypto, createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
    input: { coarsePointer: true, finePointer: false },
  });
beforeEach(() => {
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setMobileSettingSnapshot(null);
  mobileContentPlugins.install([]);
  mobilePluginElementSupport.clear();
});

it("uploadRemote 使用当前独立配置与原始字节，本地模式不自动选择服务", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const runtime = new MobilePluginRuntime(
    environment("android"),
    createMemoryStorage(),
    "A.db",
    { push: vi.fn() },
    "0.2.4"
  );
  let context!: PluginContext;
  const upload = vi
    .fn<(file: UploadFile, config: JsonValue, signal: AbortSignal) => Promise<string>>()
    .mockResolvedValue("https://example.com/resource");
  runtime.host.registerTrusted(
    definePlugin({
      id: "fixture.upload",
      name: "fixture",
      version: "1.0.0",
      create: () => ({
        activate(current) {
          context = current;
          current.upload.register({ id: current.pluginId, name: "fixture", upload });
        },
      }),
    })
  );
  await runtime.host.enable("fixture.upload");
  const config = { bucket: "original" };
  const setting = {
    database: { active: "A.db", databases: [] },
    sync: { active: "plugin" },
    imageBed: {
      active: "local",
      local: { path: "resources" },
      enableCompression: false,
      plugin: { id: "fixture.upload", configurations: { "fixture.upload": config } },
    },
  } as SettingCompat;
  try {
    setMobileSettingSnapshot(setting);
    const content = new Uint8Array([1, 255]);
    const file = { name: "../nested.bin", mimeType: "application/octet-stream", content };
    await expect(context.upload.uploadRemote(file)).rejects.toThrow("本地保存");
    expect(upload).not.toHaveBeenCalled();
    setting.imageBed.active = "plugin";
    setMobileSettingSnapshot(setting);
    const pending = context.upload.uploadRemote(file);
    config.bucket = "changed";
    content[0] = 3;
    await expect(pending).resolves.toBe("https://example.com/resource");
    expect(upload.mock.calls[0][0].name).toMatch(/^nested_[a-f0-9-]+\.bin$/);
    expect(upload.mock.calls[0][0].content).toEqual(new Uint8Array([1, 255]));
    expect(upload.mock.calls[0][1]).toEqual({ bucket: "original" });
    await runtime.host.disable("fixture.upload");
    await expect(context.upload.uploadRemote(file)).rejects.toThrow();
  } finally {
    await runtime.dispose();
  }
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
      "0.2.4"
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
      await expect(entry.context.fetch("https://example.invalid")).rejects.toThrow("尚未就绪");
      expect(() =>
        entry.context.settings.register({
          id: "domain",
          title: "领域设置",
          target: "publish",
          component: () => null,
        })
      ).toThrow("领域设置");
      await runtime.dispose();
      await expect(entry.definition.page.open()).rejects.toThrow();
      expect(runtime.entries.size).toBe(0);
      expect(runtime.settings.size).toBe(0);
    } finally {
      await runtime.dispose();
    }
  }
);
it("已声明平台直接装配实际节点与编辑入口，不需要第二份节点表", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const [, abc] = await portableFixtures();
  const runtime = new MobilePluginRuntime(
    environment("ios"),
    createMemoryStorage(),
    "A",
    { push: vi.fn() },
    "0.2.4"
  );
  try {
    await runtime.start([{ id: "tau.abc", artifact: abc, enabled: true }], sharedPluginModules);
    expect([...runtime.errors]).toEqual([]);
    expect(runtime.elementSupport.get("abc")).toBe("edit");
    expect(runtime.content.extensions.some(extension => extension.blockPanel)).toBe(true);
  } finally {
    await runtime.dispose();
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
    "0.2.4"
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

it("中心撤回立即阻止节点写入并停用页面，保留静态正文到会话边界", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const artifacts = await portableFixtures();
  const runtime = new MobilePluginRuntime(
    environment("ios"),
    createMemoryStorage(),
    "A",
    { push: vi.fn() },
    "0.2.4"
  );
  try {
    await runtime.start(
      artifacts.map(artifact => ({ id: artifact.manifest.id, artifact, enabled: true })),
      sharedPluginModules
    );
    expect(runtime.elementSupport.get("abc")).toBe("edit");
    const abc = artifacts.find(artifact => artifact.manifest.id === "tau.abc")!;
    const blocked = runtime.blockFromCenter(abc.manifest.id);
    expect(runtime.elementSupport.get("abc")).toBe("none");
    await blocked;
    expect(runtime.isPluginActive(abc.manifest.id)).toBe(false);
    expect(runtime.content.list().length).toBeGreaterThan(0);
    const page = artifacts.find(artifact => artifact.manifest.id !== "tau.abc")!;
    await runtime.blockFromCenter(page.manifest.id);
    expect(runtime.entries.size).toBe(0);
  } finally {
    await runtime.dispose();
  }
});

it("每个 runtime 独立注册 TTS 并打开插件设置页", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const push = vi.fn();
  const runtime = new MobilePluginRuntime(
    environment("android"),
    createMemoryStorage(),
    "A",
    { push },
    "0.2.4"
  );
  const other = new MobilePluginRuntime(
    environment("ios"),
    createMemoryStorage(),
    "B",
    { push: vi.fn() },
    "0.2.4"
  );
  let openSettings!: () => Promise<void>;
  try {
    runtime.host.registerTrusted(
      definePlugin({
        id: "fixture.tts",
        name: "fixture",
        version: "1.0.0",
        create: () => ({
          activate(context) {
            context.tts.register({
              id: context.pluginId,
              name: "fixture",
              create: () => ({
                textInstructions: "移动",
                getVoices: async () => [],
                synthesize: async () => ({ audio: new Uint8Array(), mime: "audio/wav" }),
              }),
            });
            openSettings = context.settings.register({
              id: "voice",
              title: "语音",
              target: "tts",
              component: () => null,
            }).open;
          },
        }),
      })
    );
    await runtime.host.enable("fixture.tts");
    expect(runtime.tts).not.toBe(other.tts);
    const signal = new AbortController().signal;
    await expect(
      runtime.tts.execute(
        {
          kind: "open",
          session: "runtime",
          pluginId: "fixture.tts",
          config: {},
          modelId: "model",
        },
        signal
      )
    ).resolves.toMatchObject({ canClone: false, textInstructions: "移动" });
    await openSettings();
    expect(push).toHaveBeenCalledWith("pluginSettings", { id: "fixture.tts:voice" });
    await runtime.tts.execute({ kind: "close", session: "runtime" }, signal);
  } finally {
    await runtime.dispose();
    await other.dispose();
  }
});
