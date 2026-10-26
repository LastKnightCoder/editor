import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UiProvider } from "@tau/ui";
import type { PluginContext } from "@tau/plugins";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import useSettingStore from "@/stores/useSettingStore";
import { ProviderAccountSettings } from "../components/ProviderAccountSettings";
const mocks = vi.hoisted(() => ({ tts: vi.fn(), images: vi.fn() }));
vi.mock("@/commands/plugin-tts", () => ({ savePluginTTSConfig: mocks.tts }));
vi.mock("@/commands/plugin-images", () => ({ savePluginImagesConfig: mocks.images }));
vi.mock("@/features/settings/sections/TTSPluginCloneSection", () => ({
  TTSPluginCloneSection: () => null,
}));
let container: HTMLDivElement, root: Root;
const previous = useSettingStore.getState().setting;
const section = (target: "tts" | "images"): RegisteredPluginSettings =>
  ({
    key: "plugin:test.provider:account",
    mountId: 1,
    context: { pluginId: "test.provider", signal: new AbortController().signal } as PluginContext,
    definition: {
      id: "account",
      title: "测试提供方",
      target,
      models: [{ id: "default-model" }],
      form: {
        groups: [{ title: "连接", fields: [{ key: "apiKey", label: "API Key", type: "secret" }] }],
      },
    },
  }) as RegisteredPluginSettings;
const accounts = ["a", "b"].map(id => ({
  id,
  name: id,
  pluginId: "test.provider",
  config: { apiKey: `key-${id}`, preserved: true },
  models: [{ id: "custom-model" }],
  modelId: "custom-model",
}));
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(node => node.textContent?.trim() === text)!;
async function type(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="API Key"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  mocks.tts.mockReset().mockResolvedValue(undefined);
  mocks.images.mockReset().mockResolvedValue(undefined);
  useSettingStore.setState({
    setting: {
      ...previous,
      ttsProviders: structuredClone(accounts),
      ttsUsageSettings: { default: { providerId: "b", modelId: "custom-model", voiceId: "voice" } },
      imageGeneration: { providers: structuredClone(accounts), currentProviderId: "b" },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useSettingStore.setState({ setting: previous });
});
it.each(["tts", "images"] as const)(
  "%s 保存失败保留草稿，成功只修改该账号且不切换当前服务",
  async target => {
    await act(async () =>
      root.render(
        <UiProvider>
          <ProviderAccountSettings section={section(target)} />
        </UiProvider>
      )
    );
    await type("new-secret");
    const save = target === "tts" ? mocks.tts : mocks.images;
    save.mockRejectedValueOnce(new Error("写入失败"));
    await act(async () => button("保存").click());
    expect(container.textContent).toContain("写入失败");
    expect(useSettingStore.getState().setting.ttsProviders[0].config).toMatchObject({
      apiKey: "key-a",
    });
    expect(useSettingStore.getState().setting.imageGeneration.providers[0].config).toMatchObject({
      apiKey: "key-a",
    });
    await act(async () => button("保存").click());
    const saved = useSettingStore.getState().setting;
    const list = target === "tts" ? saved.ttsProviders : saved.imageGeneration.providers;
    expect(list[0].config).toEqual({ apiKey: "new-secret", preserved: true });
    expect(list[1].config).toMatchObject({ apiKey: "key-b" });
    expect(saved.ttsUsageSettings.default).toEqual({
      providerId: "b",
      modelId: "custom-model",
      voiceId: "voice",
    });
    expect(saved.imageGeneration.currentProviderId).toBe("b");
    expect(save).toHaveBeenLastCalledWith(
      "a",
      "test.provider",
      { apiKey: "new-secret", preserved: true },
      target === "tts" ? [{ id: "custom-model" }] : "custom-model"
    );
  }
);
it.each(["tts", "images"] as const)("%s 添加账号不自动选用", async target => {
  await act(async () =>
    root.render(
      <UiProvider>
        <ProviderAccountSettings section={section(target)} />
      </UiProvider>
    )
  );
  await act(async () => button("添加账号").click());
  const saved = useSettingStore.getState().setting;
  expect(target === "tts" ? saved.ttsProviders : saved.imageGeneration.providers).toHaveLength(3);
  expect(saved.ttsUsageSettings.default?.providerId).toBe("b");
  expect(saved.imageGeneration.currentProviderId).toBe("b");
  expect(mocks.tts).not.toHaveBeenCalled();
  expect(mocks.images).not.toHaveBeenCalled();
});
