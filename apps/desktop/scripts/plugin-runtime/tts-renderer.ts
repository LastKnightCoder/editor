import { definePlugin } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { Button, Input } from "@tau/ui";
import { rendererTTSRegistry } from "../../src/app/plugins/tts-registry";
import { connectTTSRenderer } from "../../src/app/plugins/tts-bridge";
import { connectUploadRenderer } from "../../src/app/plugins/upload-bridge";
import { rendererUploadRegistry } from "../../src/app/plugins/upload-registry";
import { uploadRemoteResource } from "../../src/services/resource-upload";
import useSettingStore, { EImageBed } from "../../src/stores/useSettingStore";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";

async function start() {
  const artifact = await window.electron.invoke<DevelopmentPluginPackage>("tts-test:artifact");
  const requests: { url: string; body?: string; authorization: string | null }[] = [];
  const uploads: number[][] = [];
  const uploadSignals: AbortSignal[] = [];
  const host = new PluginHost({
    workspaceId: "isolated",
    storage: createMemoryStorage(),
    tts: rendererTTSRegistry,
    upload: {
      register: (context, definition) => rendererUploadRegistry.register(context, definition),
      uploadRemote: uploadRemoteResource,
    },
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
      if (body.text === "pending" || body.input?.text === "pending")
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true })
        );
      if (url === "https://audio.test/generated.mp3")
        return new Response(new Uint8Array([0, 255, 16]));
      if (init?.method === "HEAD") return new Response("");
      if (url.endsWith("SpeechSynthesizer"))
        return new Response(
          JSON.stringify({ output: { audio: { url: "https://audio.test/generated.mp3" } } })
        );
      if (body.input?.action === "create_voice")
        return new Response(JSON.stringify({ output: { voice_id: "qwen-created" } }));
      if (body.input?.action === "list_voice")
        return new Response(JSON.stringify({ output: { voice_list: [] } }));
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
    definePlugin({
      id: "test.reference-upload",
      name: "参考上传",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.upload.register({
            id: context.pluginId,
            name: "参考上传",
            upload: async (file, _config, signal) => {
              uploads.push(Array.from(file.content));
              uploadSignals.push(signal);
              if (file.name.includes("pending"))
                return new Promise((_resolve, reject) =>
                  signal.addEventListener("abort", () => reject(signal.reason), { once: true })
                );
              return "https://files.test/voice.wav";
            },
          });
        },
      }),
    })
  );
  await host.enable("test.reference-upload");
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      imageBed: {
        ...state.setting.imageBed,
        active: EImageBed.Plugin,
        plugin: { id: "test.reference-upload", configurations: { "test.reference-upload": {} } },
      },
    },
  }));
  connectUploadRenderer();
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
    ttsTest: {
      requests,
      uploads,
      lastUploadAborted: () => uploadSignals.at(-1)?.aborted,
      localUploads: () =>
        useSettingStore.setState(state => ({
          setting: {
            ...state.setting,
            imageBed: { ...state.setting.imageBed, active: EImageBed.Local },
          },
        })),
      disable: () => host.disable(artifact.manifest.id),
      disconnect,
    },
  });
}
void start().catch(console.error);
