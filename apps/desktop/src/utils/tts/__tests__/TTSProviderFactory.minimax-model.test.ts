import { afterEach, describe, expect, it } from "vitest";
import useSettingStore, { mergeSettingWithDefaults } from "@/stores/useSettingStore";
import { ETTSProvider } from "@/types/tts";
import { TTSProviderFactory } from "@/utils/tts/TTSProviderFactory";

describe("utils/tts/TTSProviderFactory", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);

  afterEach(() => {
    useSettingStore.setState(state => ({
      ...state,
      setting: structuredClone(initialSetting),
    }));
  });

  const setTTSState = (patch: {
    ttsProviders?: typeof initialSetting.ttsProviders;
    usage?: typeof initialSetting.ttsUsageSettings;
  }) => {
    const current = useSettingStore.getState().setting;
    useSettingStore.setState(state => ({
      ...state,
      setting: {
        ...current,
        ttsProviders: patch.ttsProviders ?? current.ttsProviders,
        ttsUsageSettings: patch.usage ?? current.ttsUsageSettings,
      },
    }));
  };

  it("按 ttsUsageSettings.default 解析出 Minimax 提供商", () => {
    setTTSState({
      ttsProviders: [
        {
          id: "p1",
          name: "Minimax",
          providerType: ETTSProvider.Minimax,
          apiKey: "test-key",
          models: [{ id: "speech-2.8-turbo" }, { id: "speech-2.8-hd" }],
        },
      ],
      usage: {
        default: { providerId: "p1", modelId: "speech-2.8-turbo", voiceId: "v1" },
      },
    });

    const provider = TTSProviderFactory.getTTSProvider();
    expect(provider?.getProviderName()).toBe(ETTSProvider.Minimax);
    // 面向能力：合成与克隆能力均可取用（工厂每次新建实例，断言能力存在而非引用同一）
    expect(provider?.synthesis?.synthesizeSpeech).toBeTypeOf("function");
    expect(TTSProviderFactory.getSpeechSynthesizer()?.synthesizeSpeech).toBeTypeOf("function");
    expect(TTSProviderFactory.getVoiceCloner()?.cloneVoice).toBeTypeOf("function");
    expect(TTSProviderFactory.getActiveProviderType()).toBe(ETTSProvider.Minimax);
  });

  it("解析出 Qwen 提供商", () => {
    setTTSState({
      ttsProviders: [
        {
          id: "p2",
          name: "百炼",
          providerType: ETTSProvider.Qwen,
          apiKey: "sk-test",
          models: [{ id: "qwen-audio-3.1-tts-flash" }],
        },
      ],
      usage: {
        default: {
          providerId: "p2",
          modelId: "qwen-audio-3.1-tts-flash",
          voiceId: "yuxiaoyun_v3.1",
        },
      },
    });

    const provider = TTSProviderFactory.getTTSProvider();
    expect(provider?.getProviderName()).toBe(ETTSProvider.Qwen);
    expect(TTSProviderFactory.getSpeechSynthesizer()?.synthesizeSpeech).toBeTypeOf("function");
    expect(TTSProviderFactory.getActiveProviderType()).toBe(ETTSProvider.Qwen);
  });

  it("getActiveTTSPromptOptions 从当前语音服务派生（供播客 prompt 分流标签规则）", async () => {
    // Qwen 激活 → provider 为 qwen，不再误用 Minimax 标签规则
    setTTSState({
      ttsProviders: [
        {
          id: "p2",
          name: "百炼",
          providerType: ETTSProvider.Qwen,
          apiKey: "sk-test",
          models: [{ id: "qwen-audio-3.1-tts-flash" }],
        },
      ],
      usage: {
        default: {
          providerId: "p2",
          modelId: "qwen-audio-3.1-tts-flash",
          voiceId: "",
        },
      },
    });
    expect(await TTSProviderFactory.getActiveTTSPromptOptions()).toEqual({
      provider: ETTSProvider.Qwen,
      minimaxModel: "qwen-audio-3.1-tts-flash",
    });

    // 未配置 → 回落 Minimax 默认（保持 legacy prompt 行为）
    setTTSState({ usage: { default: null } });
    expect(await TTSProviderFactory.getActiveTTSPromptOptions()).toEqual({
      provider: ETTSProvider.Minimax,
      minimaxModel: "speech-2.8-hd",
    });
  });

  it("未配置用法 / 用法指向不存在的服务商 / 缺 API Key 时返回 null", () => {
    setTTSState({
      ttsProviders: [
        {
          id: "p1",
          name: "Minimax",
          providerType: ETTSProvider.Minimax,
          apiKey: "test-key",
          models: [{ id: "speech-2.8-turbo" }],
        },
      ],
      usage: { default: null },
    });
    expect(TTSProviderFactory.getTTSProvider()).toBeNull();

    setTTSState({
      usage: { default: { providerId: "missing", modelId: "x", voiceId: "" } },
    });
    expect(TTSProviderFactory.getTTSProvider()).toBeNull();

    setTTSState({
      ttsProviders: [
        {
          id: "p3",
          name: "无凭据",
          providerType: ETTSProvider.Qwen,
          apiKey: "",
          models: [{ id: "qwen-audio-3.1-tts-flash" }],
        },
      ],
      usage: {
        default: { providerId: "p3", modelId: "qwen-audio-3.1-tts-flash", voiceId: "" },
      },
    });
    expect(TTSProviderFactory.getTTSProvider()).toBeNull();
    expect(TTSProviderFactory.getSpeechSynthesizer()).toBeNull();
    expect(TTSProviderFactory.getVoiceCloner()).toBeNull();
  });
});

describe("useSettingStore TTS 老配置迁移", () => {
  it("legacy minimax 配置一次性迁移为 ttsProviders + 默认用法", () => {
    const legacy = mergeSettingWithDefaults({
      integration: {
        minimax: {
          enabled: true,
          apiKey: "legacy-key",
          userInfo: { isConnected: false },
        },
        podcastTTS: {
          active: ETTSProvider.Minimax,
          minimaxModel: "speech-2.8-hd",
          currentVoiceId: "old-voice",
        },
      } as never,
    } as never);

    expect(legacy.ttsProviders).toHaveLength(1);
    expect(legacy.ttsProviders[0]).toMatchObject({
      providerType: ETTSProvider.Minimax,
      apiKey: "legacy-key",
    });
    expect(legacy.ttsUsageSettings.default).toEqual({
      providerId: legacy.ttsProviders[0].id,
      modelId: "speech-2.8-hd",
      voiceId: "old-voice",
    });

    // 幂等：已迁移标记后再次合并不重复生成
    const again = mergeSettingWithDefaults(legacy);
    expect(again.ttsProviders).toHaveLength(1);

    // 完整回环：持久化快照（JSON 序列化）再恢复也不复活迁移、不自愈改写有效配置
    const restored = mergeSettingWithDefaults(JSON.parse(JSON.stringify(legacy)));
    expect(restored.ttsProviders).toHaveLength(1);
    expect(restored.ttsUsageSettings.default).toEqual(legacy.ttsUsageSettings.default);

    // 幂等标记的真正职责：迁移后用户删光服务商（legacy key 仍留在 integration.minimax），
    // 再次合并不得复活已删除的迁移配置
    const wiped = JSON.parse(JSON.stringify(legacy)) as typeof legacy;
    wiped.ttsProviders = [];
    wiped.ttsUsageSettings.default = null;
    const afterWipe = mergeSettingWithDefaults(wiped);
    expect(afterWipe.ttsProviders).toEqual([]);
    expect(afterWipe.ttsUsageSettings.default).toBeNull();
  });

  it("空白 legacy minimaxModel 回落默认模型且不产生空模型条目", () => {
    const legacy = mergeSettingWithDefaults({
      integration: {
        minimax: { enabled: true, apiKey: "k", userInfo: { isConnected: false } },
        podcastTTS: {
          active: ETTSProvider.Minimax,
          minimaxModel: "",
          currentVoiceId: "",
        },
      } as never,
    } as never);

    expect(legacy.ttsProviders[0].models.map(m => m.id)).not.toContain("");
    expect(legacy.ttsUsageSettings.default?.modelId).toBe("speech-2.8-hd");
  });

  it("usage 悬空指向自愈：provider 不存在时回落，全部缺失时清空", () => {
    const healed = mergeSettingWithDefaults({
      ttsProviders: [
        {
          id: "p1",
          name: "百炼",
          providerType: ETTSProvider.Qwen,
          apiKey: "sk",
          models: [{ id: "qwen-audio-3.1-tts-flash" }],
        },
      ],
      ttsUsageSettings: {
        default: { providerId: "ghost", modelId: "whatever", voiceId: "v" },
      },
    } as never);

    expect(healed.ttsUsageSettings.default).toEqual({
      providerId: "p1",
      modelId: "qwen-audio-3.1-tts-flash",
      voiceId: "",
    });

    const emptied = mergeSettingWithDefaults({
      ttsProviders: [],
      ttsUsageSettings: {
        default: { providerId: "ghost", modelId: "whatever", voiceId: "v" },
      },
    } as never);
    expect(emptied.ttsUsageSettings.default).toBeNull();
  });

  it("无 legacy 凭据时不生成空服务商", () => {
    const fresh = mergeSettingWithDefaults({});
    expect(fresh.ttsProviders).toEqual([]);
    expect(fresh.ttsUsageSettings.default).toBeNull();
  });

  it("已有 ttsProviders 的用户不会被迁移覆盖", () => {
    const existing = mergeSettingWithDefaults({
      integration: {
        minimax: {
          enabled: true,
          apiKey: "legacy-key",
          userInfo: { isConnected: false },
        },
      } as never,
      ttsProviders: [
        {
          id: "mine",
          name: "自建",
          providerType: ETTSProvider.Qwen,
          apiKey: "sk-mine",
          models: [{ id: "qwen-audio-3.1-tts-flash" }],
        },
      ],
      ttsUsageSettings: {
        default: { providerId: "mine", modelId: "qwen-audio-3.1-tts-flash", voiceId: "" },
      },
    } as never);

    expect(existing.ttsProviders).toHaveLength(1);
    expect(existing.ttsProviders[0].id).toBe("mine");
    expect(existing.ttsUsageSettings.default?.providerId).toBe("mine");
  });
});
