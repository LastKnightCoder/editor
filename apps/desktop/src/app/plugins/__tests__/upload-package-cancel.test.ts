import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { definePlugin } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../../../shared/plugin-package";
import { portableSharedPluginModules } from "@tau/plugins/portable-shared-modules";
import { evaluatePluginPackage, evaluatePortablePluginPackage } from "@tau/plugins/rendering";
import { RendererUploadRegistry } from "../upload-registry";
import { RendererSyncRegistry } from "../sync-registry";
const zip = process.env.TAU_UPLOAD_PLUGIN_ZIP;
it.skipIf(!zip)("真实上传包把单次取消信号传给网络请求", async () => {
  const artifact: DevelopmentPluginPackage = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        "const z=new(require('adm-zip'))(process.argv[1]);const e=z.getEntries().find(e=>e.entryName.endsWith('/manifest.json'));const m=JSON.parse(e.getData().toString());process.stdout.write(JSON.stringify({manifest:m,code:z.readAsText(m.id+'/'+m.main)}));",
        zip!,
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
    )
  );
  const registry = new RendererUploadRegistry();
  let networkSignal: AbortSignal | undefined;
  const host = new PluginHost({
    workspaceId: "test",
    environment: { platform: "desktop", input: { coarsePointer: false, finePointer: true } },
    storage: createMemoryStorage(),
    upload: registry,
    sync: new RendererSyncRegistry(),
    settings: {
      register: (_context, definition) => ({
        id: definition.id,
        open: async () => {},
        dispose() {},
      }),
    },
    fetch: async (_input, init) => {
      networkSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) =>
        networkSignal?.addEventListener("abort", () => reject(networkSignal!.reason), {
          once: true,
        })
      );
    },
  });
  host.registerTrusted(
    artifact.manifest.formatVersion === 3
      ? evaluatePortablePluginPackage(
          artifact as DevelopmentPluginPackage & {
            manifest: import("@tau/plugins/portable").ReadablePortablePluginManifest;
          },
          portableSharedPluginModules,
          {
            environment: {
              platform: "desktop",
              input: { coarsePointer: false, finePointer: true },
            },

            appVersion: "0.59.4",
            profiles: ["web-v1"],
          }
        )
      : evaluatePluginPackage(artifact as import("@tau/plugins/host").DevelopmentPluginPackage, {
          "@tau/plugins": { definePlugin },
          "@tau/ui": {},
          react: React,
          "react/jsx-runtime": jsx,
        })
  );
  try {
    await host.enable(artifact.manifest.id);
    const controller = new AbortController();
    const pending = registry.upload(
      artifact.manifest.id,
      { name: "a.wav", mimeType: "audio/wav", content: new Uint8Array([0, 255]) },
      {
        token: "test",
        owner: "test",
        repo: "test",
        branch: "main",
        accessKeyId: "test",
        accessKeySecret: "test",
        secretAccessKey: "test",
        bucket: "test-bucket",
        region: artifact.manifest.id.endsWith("oss") ? "oss-cn-hangzhou" : "us-east-1",
        urlStyle: "path",
        url: "https://example.invalid/dav",
        username: "fixture",
        password: "fixture",
      },
      controller.signal
    );
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(networkSignal).toBeDefined());
    controller.abort();
    await assertion;
    expect(networkSignal!.aborted).toBe(true);
  } finally {
    await host.dispose();
  }
});
