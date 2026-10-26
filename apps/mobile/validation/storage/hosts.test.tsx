import { readFile } from "node:fs/promises";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { transferableAbortController } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { RendererSyncRegistry, RendererUploadRegistry } from "@tau/plugins/provider-host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { portableSharedPluginModules } from "@tau/plugins/portable-shared-modules";
import {
  assertProviderForm,
  mergeProviderFormValues,
  readProviderFormValues,
  validateProviderFormValues,
  type PluginContext,
  type PluginSettingsDefinition,
} from "@tau/plugins";
import { MobilePluginRuntime } from "../../src/app/plugins/runtime";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it.each(["desktop", "android", "ios"] as const)(
  "%s 加载相同七个发行包，存储设置均为可保存的声明式表单",
  async platform => {
    const reportPath = process.env.TAU_STORAGE_AUTHORS_REPORT;
    if (!reportPath) throw new Error("请通过 TAU_STORAGE_AUTHORS_REPORT 指定仓库外作者构建报告");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const controller = transferableAbortController();
    vi.stubGlobal("AbortController", controller.constructor);
    vi.stubGlobal("AbortSignal", controller.signal.constructor);
    vi.stubGlobal("crypto", webcrypto);
    const environment = createPluginEnvironmentStore({
      platform,
      input: { coarsePointer: platform !== "desktop", finePointer: platform === "desktop" },
    });
    const settings = new Map<
      string,
      { context: PluginContext; definition: PluginSettingsDefinition }
    >();
    const sync = new RendererSyncRegistry();
    const upload = new RendererUploadRegistry();
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ login: "fixture", email: "fixture@example.invalid" }), {
          headers: { "content-type": "application/json" },
        })
    );
    const mobile =
      platform === "desktop"
        ? null
        : new MobilePluginRuntime(
            environment,
            createMemoryStorage(),
            "fixture.db",
            { push: vi.fn() },
            "0.2.3"
          );
    if (mobile) mobile.fetch = fetch;
    const host =
      mobile?.host ??
      new PluginHost({
        workspaceId: "fixture.db",
        environmentSource: environment,
        storage: createMemoryStorage(),
        sync,
        upload,
        fetch,
        settings: {
          register(context, definition) {
            const id = `${context.pluginId}:${definition.id}`;
            settings.set(id, { context, definition });
            return {
              id,
              open: async () => undefined,
              dispose: () => {
                settings.delete(id);
              },
            };
          },
        },
      });
    try {
      for (const item of report.results) {
        if (item.status !== "passed") throw new Error("作者构建未通过");
        const author = JSON.parse(await readFile(path.join(item.author, "manifest.json"), "utf8"));
        if (
          !author.categories?.some(
            (category: string) => category === "sync" || category === "upload"
          )
        )
          continue;
        const pointer = JSON.parse(
          await readFile(path.join(item.author, "dist", `tau-build-${author.id}.json`), "utf8")
        );
        const directory = path.join(item.author, "dist", pointer.directory);
        const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
        const code = await readFile(path.join(directory, manifest.main), "utf8");
        const definition = evaluatePortablePluginPackage(
          { manifest, code },
          portableSharedPluginModules,
          {
            environment: environment.getSnapshot(),

            appVersion: platform === "desktop" ? "0.59.2" : "0.2.3",
            profiles: ["web-v1"],
          }
        );
        host.registerTrusted(definition);
        await host.enable(definition.id);
      }
      expect((mobile?.sync ?? sync).list()).toHaveLength(4);
      expect((mobile?.upload ?? upload).list()).toHaveLength(4);
      const sections = mobile?.settings ?? settings;
      expect(sections.size).toBe(8);
      for (const { context, definition } of sections.values()) {
        expect(context.signal.aborted, `${platform} ${context.pluginId} 应保持激活`).toBe(false);
        const config = {
          token: "fixture",
          owner: "fixture",
          repo: "fixture",
          branch: "main",
          email: "",
          accessKeyId: "fixture",
          secretAccessKey: "fixture",
          accessKeySecret: "fixture",
          bucket: "fixture",
          region: "us-east-1",
          endpoint: "",
          urlStyle: "path",
          url: "https://example.invalid/dav",
          username: "fixture",
          password: "fixture",
          path: "notes",
          pathPrefix: "notes",
          publicBaseUrl: "",
        };
        // 存储设置只声明表单：各端渲染由宿主负责，这里核对声明完整且夹具配置可保存
        if (!definition.form) throw new Error(`${context.pluginId} 仍以组件注册存储设置`);
        expect(() => assertProviderForm(definition.form!)).not.toThrow();
        const values = readProviderFormValues(definition.form, config);
        expect(validateProviderFormValues(definition.form, values)).toEqual({});
        const prepared = definition.form.beforeSave
          ? await definition.form.beforeSave(values, new AbortController().signal)
          : values;
        expect(mergeProviderFormValues(config, prepared)).toEqual(
          expect.objectContaining(prepared)
        );
      }
    } finally {
      await (mobile ? mobile.dispose() : host.dispose());
    }
  }
);
