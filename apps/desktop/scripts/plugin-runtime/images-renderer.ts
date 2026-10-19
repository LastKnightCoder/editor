import { definePlugin } from "@tau/plugins";
import { PluginHost, createMemoryStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { Button, Input } from "@tau/ui";
import { rendererImagesRegistry } from "../../src/app/plugins/images-registry";
import { connectImagesRenderer } from "../../src/app/plugins/images-bridge";

async function start() {
  const artifact = await window.electron.invoke<DevelopmentPluginPackage>("images-test:artifact");
  const requests: { url: string; model?: string; authorization: string | null; images: number }[] =
    [];
  let lastSignal: AbortSignal | undefined;
  const host = new PluginHost({
    workspaceId: "isolated",
    storage: createMemoryStorage(),
    images: rendererImagesRegistry,
    settings: {
      register: (_context, definition) => ({
        id: definition.id,
        open: async () => {},
        dispose() {},
      }),
    },
    fetch: async (input, init) => {
      const url = String(input);
      const body =
        init?.body instanceof FormData
          ? Object.fromEntries(init.body.entries())
          : typeof init?.body === "string"
            ? JSON.parse(init.body)
            : {};
      requests.push({
        url,
        model: body.model,
        authorization: new Headers(init?.headers).get("Authorization"),
        images: init?.body instanceof FormData ? init.body.getAll("image[]").length : 0,
      });
      lastSignal = init?.signal ?? undefined;
      if (body.prompt === "pending")
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true })
        );
      if (url === "https://cdn.test/image")
        return new Response(new Uint8Array([0, 255, 16]), {
          headers: { "content-type": "image/webp" },
        });
      return new Response(
        JSON.stringify({
          data: [
            body.prompt === "url"
              ? { url: "https://cdn.test/image" }
              : { b64_json: "AP8Q", output_format: "png" },
          ],
        }),
        { headers: { "content-type": "application/json" } }
      );
    },
  });
  host.registerTrusted(
    evaluatePluginPackage(artifact, {
      "@tau/plugins": { definePlugin },
      "@tau/ui": { Button, Input },
      react: React,
      "react/jsx-runtime": jsx,
    })
  );
  await host.enable(artifact.manifest.id);
  const disconnect = connectImagesRenderer();
  Object.assign(window, {
    imagesTest: {
      requests,
      disable: () => host.disable(artifact.manifest.id),
      lastAborted: () => lastSignal?.aborted,
      disconnect,
    },
  });
}
void start().catch(console.error);
