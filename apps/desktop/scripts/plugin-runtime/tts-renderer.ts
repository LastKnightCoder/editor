import { definePlugin } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { Button, Input } from "@tau/ui";
import { rendererTTSRegistry } from "../../src/app/plugins/tts-registry";
import { connectTTSRenderer } from "../../src/app/plugins/tts-bridge";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";

async function start() {
  const artifact = await window.electron.invoke<DevelopmentPluginPackage>("tts-test:artifact");
  const requests: { url: string; body?: string; authorization: string | null }[] = [];
  const host = new PluginHost({
    workspaceId: "isolated",
    storage: createMemoryStorage(),
    tts: rendererTTSRegistry,
    settings: {
      register: (_context, definition) => ({
        id: definition.id,
        open: async () => {},
        dispose() {},
      }),
    },
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        body: typeof init?.body === "string" ? init.body : undefined,
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (body.text === "pending")
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true })
        );
      return new Response(
        JSON.stringify({
          base_resp: { status_code: 0, status_msg: "" },
          ...(url.endsWith("t2a_v2")
            ? { data: { audio: "00ff10" } }
            : url.endsWith("get_voice")
              ? { system_voice: [{ voice_id: "v" }] }
              : url.endsWith("files/upload")
                ? { file: { file_id: 123 } }
                : {}),
        })
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
  const disconnect = connectTTSRenderer();
  Object.assign(window, {
    ttsTest: { requests, disable: () => host.disable(artifact.manifest.id), disconnect },
  });
}
void start().catch(console.error);
