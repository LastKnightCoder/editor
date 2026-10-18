import { afterEach, expect, it, vi } from "vitest";
import useSettingStore, { mergeSettingWithDefaults } from "@/stores/useSettingStore";
import { TTSProviderFactory } from "../TTSProviderFactory";

const mocks = vi.hoisted(() => ({ create: vi.fn(() => ({ synthesis: {} })) }));
vi.mock("../PluginTTSProvider", () => ({ createPluginTTSProvider: mocks.create }));
const initial = structuredClone(useSettingStore.getState().setting);
afterEach(() => {
  useSettingStore.setState({ setting: structuredClone(initial) });
  vi.clearAllMocks();
});
const providers = ["a", "b"].map(id => ({
  id,
  name: id,
  pluginId: "example.tts",
  config: { account: id },
  models: [{ id: "model" }],
}));

it("同插件多账号只将选中账号传给渲染实例", () => {
  useSettingStore.setState({
    setting: mergeSettingWithDefaults({
      ttsProviders: providers,
      ttsUsageSettings: { default: { providerId: "b", modelId: "custom", voiceId: "voice" } },
    }),
  });
  TTSProviderFactory.getTTSProvider();
  expect(mocks.create).toHaveBeenCalledWith(providers[1], "custom");
  expect(TTSProviderFactory.getActiveProviderType()).toBe("example.tts");
});

it("缺失账号不回退，重新加载保留插件缺失时的选择和凭据", () => {
  const usage = { providerId: "missing", modelId: "model", voiceId: "voice" };
  const setting = mergeSettingWithDefaults({
    ttsProviders: providers,
    ttsUsageSettings: { default: usage },
  });
  expect(setting.ttsUsageSettings.default).toEqual(usage);
  expect(mergeSettingWithDefaults(JSON.parse(JSON.stringify(setting))).ttsProviders).toEqual(
    providers
  );
  useSettingStore.setState({ setting });
  expect(TTSProviderFactory.getTTSProvider()).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("新设置不再生成旧账号入口及迁移标记", () => {
  const setting = mergeSettingWithDefaults({});
  expect(setting.integration).not.toHaveProperty("minimax");
  expect(setting.integration).not.toHaveProperty("podcastTTS");
  expect(setting.misc).not.toHaveProperty("tts");
});
