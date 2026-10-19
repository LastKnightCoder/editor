import { definePlugin, type PluginServices } from "@tau/plugins";
import { PluginHost, createMemoryStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { Button, Input } from "@tau/ui";
import useSettingStore from "../../src/stores/useSettingStore";
import { connectVideoRenderer, rendererVideoRegistry } from "../../src/app/plugins/video-bridge";

const json = (data: unknown) =>
  new Response(JSON.stringify({ code: 0, message: "0", data }), {
    headers: { "content-type": "application/json" },
  });

async function start() {
  const artifacts =
    await window.electron.invoke<DevelopmentPluginPackage[]>("video-test:artifacts");
  const requests: { url: string; cookie: string | null }[] = [];
  let lastSignal: AbortSignal | undefined;
  let probeProxy: string | undefined;
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      onlineVideo: {
        configurations: {
          bilibili: { SESSDATA: "sess", user: { name: "u", avatar: "", vipStatus: 1 } },
          youtube: { proxy: "http://127.0.0.1:7890" },
        },
      },
    },
  }));
  const services = {
    videoExtractor: {
      probe: async (_url: string, options?: { proxy?: string }) => {
        probeProxy = options?.proxy;
        return {
          title: "演讲",
          formats: [
            { id: "299", videoOnly: true, audioOnly: false, ext: "mp4", height: 1080, fps: 60 },
            { id: "140", videoOnly: false, audioOnly: true, ext: "m4a", bitrate: 128 },
          ],
        };
      },
    },
  } as unknown as PluginServices;
  const host = new PluginHost({
    workspaceId: "isolated",
    storage: createMemoryStorage(),
    video: rendererVideoRegistry,
    services,
    settings: {
      register: (_context, definition) => ({
        id: definition.id,
        open: async () => {},
        dispose() {},
      }),
    },
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, cookie: new Headers(init?.headers).get("Cookie") });
      lastSignal = init?.signal ?? undefined;
      if (url.includes("b23.tv/slow"))
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true })
        );
      if (init?.method === "HEAD") return new Response(null, { status: 200 });
      if (url.includes("/x/web-interface/view"))
        return json({
          bvid: "BV1xx411c7mD",
          cid: 100,
          title: "测试视频",
          pic: "https://i0.hdslb.com/a.jpg",
          pages: [
            { cid: 100, page: 1, part: "引言" },
            { cid: 200, page: 2, part: "第二讲" },
          ],
        });
      if (url.includes("/x/player/wbi/playurl"))
        return json({
          accept_quality: [32, 64, 80, 112],
          dash: {
            video: [{ id: 112, baseUrl: "https://cdn.test/v112" }],
            audio: [{ id: 30280, baseUrl: "https://cdn.test/a" }],
          },
        });
      throw new Error(`unexpected ${url}`);
    },
  });
  const modules = {
    "@tau/plugins": { definePlugin },
    "@tau/ui": { Button, Input },
    react: React,
    "react/jsx-runtime": jsx,
  };
  for (const artifact of artifacts) host.registerTrusted(evaluatePluginPackage(artifact, modules));
  const disconnect = connectVideoRenderer();
  for (const artifact of artifacts) await host.enable(artifact.manifest.id);
  rendererVideoRegistry.markReady();
  Object.assign(window, {
    videoTest: {
      requests,
      lastAborted: () => lastSignal?.aborted,
      probeProxy: () => probeProxy,
      disable: () => host.disable("bilibili"),
      disconnect,
    },
  });
}
void start().catch(console.error);
