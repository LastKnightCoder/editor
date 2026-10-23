import { readFile } from "node:fs/promises";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { transferableAbortController } from "node:util";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { RendererSyncRegistry, RendererUploadRegistry } from "@tau/plugins/provider-host";
import {
  createPluginEnvironmentStore,
  PluginEnvironmentProvider,
} from "@tau/plugins/environment-host";
import { evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { portableSharedPluginModules } from "@tau/plugins/portable-shared-modules";
import type { PluginContext, PluginSettingsDefinition } from "@tau/plugins";
import { UiProvider } from "@tau/ui";
import { MobilePluginRuntime } from "../../src/app/plugins/runtime";
import { MOBILE_PLUGIN_CAPABILITIES } from "../../src/services/plugins";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it.each(["desktop", "android", "ios"] as const)(
  "%s 加载相同七个发行包，调用相同设置 API，保留各端视图",
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
            capabilities: MOBILE_PLUGIN_CAPABILITIES,
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
        const save = vi.fn<(value: unknown) => Promise<void>>().mockResolvedValue(undefined);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const Component = definition.component;
        try {
          await act(async () =>
            root.render(
              <PluginEnvironmentProvider source={environment}>
                <UiProvider>
                  <Component
                    context={context}
                    {...(definition.target === "sync"
                      ? { syncConfig: { value: config, save } }
                      : { uploadConfig: { value: config, save } })}
                  />
                </UiProvider>
              </PluginEnvironmentProvider>
            )
          );
          if (platform === "desktop") {
            expect(container.textContent).not.toContain("仅用于当前服务");
            const button = [...container.querySelectorAll("button")].find(button =>
              button.textContent?.includes("保存")
            );
            expect(button).toBeTruthy();
            await act(async () => button!.click());
          } else {
            expect(container.textContent).toContain("仅用于当前服务");
            expect(container.textContent).toContain("存储位置");
            const edit = [...container.querySelectorAll("button")].find(
              button => button.textContent === "更换"
            );
            await act(async () => edit!.click());
            const button = [...document.querySelectorAll("button")].find(
              button =>
                button.textContent?.includes("保存账号") ||
                button.textContent?.includes("验证并保存")
            );
            expect(button).toBeTruthy();
            await act(async () => {
              button!.click();
              await Promise.resolve();
              await Promise.resolve();
            });
          }
          for (let attempt = 0; attempt < 40 && save.mock.calls.length === 0; attempt++)
            await act(async () => {
              await new Promise(resolve => setTimeout(resolve, 10));
            });
          expect(
            save,
            `${platform} ${context.pluginId}:${definition.target} ${document.body.textContent}`
          ).toHaveBeenCalledOnce();
          expect(save.mock.calls[0][0]).toEqual(expect.objectContaining({ token: "fixture" }));
        } finally {
          await act(async () => root.unmount());
          container.remove();
        }
      }
    } finally {
      await (mobile ? mobile.dispose() : host.dispose());
    }
  }
);
