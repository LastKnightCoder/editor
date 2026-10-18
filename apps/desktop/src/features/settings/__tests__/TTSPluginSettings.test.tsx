import { act } from "react";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import * as ui from "@tau/ui";
import * as sdk from "@tau/plugins";
import { createMemoryStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { registerPluginPackage } from "@/app/plugins/package-loader";
import { PluginRuntimeContext } from "@/app/plugins/context";
import useSettingStore from "@/stores/useSettingStore";
import { TTSPluginSettings } from "../sections/TTSPluginSettings";
import type { PluginTTSProviderSetting } from "@/types/tts";
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/commands/plugin-tts", () => ({ savePluginTTSConfig: mocks.save }));
const zip = process.env.TAU_TTS_PLUGIN_ZIP;
it.skipIf(!zip)("真实MiniMax表单按账号实例隔离，保存失败不改设置", async () => {
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
  const runtime = new DesktopPluginRuntime({
    workspaceId: "test",
    storage: createMemoryStorage(),
    navigator: { push() {} },
    plugins: [],
    openSettings() {},
  });
  registerPluginPackage(runtime.host, artifact, async () => ({
    "@tau/plugins": sdk,
    "@tau/ui": ui,
    react: React,
    "react/jsx-runtime": jsx,
  }));
  await runtime.host.enable(artifact.manifest.id);
  const previous = useSettingStore.getState().setting;
  const modelId =
    artifact.manifest.id === "tau.tts-qwen" ? "qwen-audio-3.1-tts-flash" : "speech-2.8-hd";
  const label = artifact.manifest.id === "tau.tts-qwen" ? "Qwen" : "MiniMax";
  const profiles: PluginTTSProviderSetting[] = ["a", "b"].map(id => ({
    id,
    name: id,
    pluginId: artifact.manifest.id,
    config: { apiKey: "key-" + id, baseUrl: "https://" + id + ".test" },
    models: [{ id: modelId }],
  }));
  useSettingStore.setState({ setting: { ...previous, ttsProviders: profiles } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (index: number) =>
    act(async () =>
      root.render(
        <ui.UiProvider>
          <PluginRuntimeContext.Provider value={runtime}>
            <TTSPluginSettings
              key={profiles[index].id}
              instance={profiles[index]}
              onDelete={() => {}}
            />
          </PluginRuntimeContext.Provider>
        </ui.UiProvider>
      )
    );
  try {
    await render(0);
    const input = () =>
      container.querySelector<HTMLInputElement>(`[aria-label="${label} API Key"]`)!;
    expect(input().value).toBe("key-a");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input(),
        "changed-a"
      );
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = () =>
      [...container.querySelectorAll("button")].find(button => button.textContent === "保存账号")!;
    mocks.save.mockRejectedValueOnce(new Error("磁盘写入失败"));
    await act(async () => save().click());
    expect(container.textContent).toContain("磁盘写入失败");
    expect(useSettingStore.getState().setting.ttsProviders[0]).toMatchObject({
      config: { apiKey: "key-a" },
    });
    mocks.save.mockResolvedValueOnce(undefined);
    await act(async () => save().click());
    expect(mocks.save).toHaveBeenLastCalledWith(
      "a",
      artifact.manifest.id,
      { apiKey: "changed-a", baseUrl: "https://a.test" },
      [{ id: modelId }]
    );
    expect(useSettingStore.getState().setting.ttsProviders[1]).toMatchObject({
      config: { apiKey: "key-b" },
    });
    await render(1);
    expect(input().value).toBe("key-b");
  } finally {
    await act(async () => {
      root.unmount();
      await runtime.dispose();
    });
    container.remove();
    useSettingStore.setState({ setting: previous });
  }
});
