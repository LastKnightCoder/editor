// @vitest-environment node
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transferableAbortController } from "node:util";
import { build } from "esbuild";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as sdk from "@tau/plugins";
import { buildPortablePluginManifest } from "@tau/plugins/portable";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../app/plugins/runtime";
import { verifyMobilePlugin } from "../plugins";

beforeEach(() => {
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

it.each(["android", "ios"] as const)(
  "OpenAI 图片实际入口可在 %s 校验、加载并执行生成与编辑",
  async platform => {
    const root = new URL("../../../../../plugins/tau-plugin-images-openai/", import.meta.url);
    const author = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
    const output = await build({
      entryPoints: [fileURLToPath(new URL("src/index.tsx", root))],
      bundle: true,
      platform: "browser",
      format: "cjs",
      write: false,
      external: ["@tau/plugins"],
      define: {
        __PLUGIN_META__: JSON.stringify({
          id: author.id,
          name: author.name,
          version: author.version,
        }),
      },
    });
    const code = output.outputFiles[0].text;
    const manifest = buildPortablePluginManifest(author, {
      main: "main.js",
      integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
    });
    const environment = { platform, input: { coarsePointer: true, finePointer: false } };
    const artifact = await verifyMobilePlugin(
      { kind: "plugin", manifest, code },
      environment,
      "0.2.16"
    );
    await expect(
      verifyMobilePlugin({ kind: "plugin", manifest, code }, environment, "0.2.15")
    ).rejects.toThrow();
    const runtime = new MobilePluginRuntime(
      createPluginEnvironmentStore(environment),
      createMemoryStorage(),
      "data.db",
      { push: vi.fn() },
      "0.2.16"
    );
    runtime.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgo=" }] }), {
          headers: { "content-type": "application/json" },
        })
    );
    try {
      await runtime.start([{ id: manifest.id, enabled: true, artifact }], { "@tau/plugins": sdk });
      expect(runtime.errors.size).toBe(0);
      expect(runtime.settings.get("tau.images-openai:connection")?.definition.target).toBe(
        "images"
      );
      const config = { apiKey: "test-key", baseUrl: "https://images.test/v1" };
      const generated = await runtime.images.execute(
        manifest.id,
        config,
        "image-model",
        { kind: "generate", request: { prompt: "生成" } },
        new AbortController().signal
      );
      expect(generated).toHaveLength(1);
      await runtime.images.execute(
        manifest.id,
        config,
        "image-model",
        { kind: "edit", request: { prompt: "换背景", images: generated } },
        new AbortController().signal
      );
      expect(vi.mocked(runtime.fetch).mock.calls.map(call => String(call[0]))).toEqual([
        "https://images.test/v1/images/generations",
        "https://images.test/v1/images/edits",
      ]);
      await runtime.host.disable(manifest.id);
      expect(runtime.images.list()).toEqual([]);
    } finally {
      await runtime.dispose();
    }
  }
);
