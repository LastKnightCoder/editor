import type { ITTSProvider, TTSProviderSetting } from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
import type { MinimaxSpeechModel } from "@/types/minimax";
import { MINIMAX_DEFAULT_SPEECH_MODEL } from "@/utils/tts/minimaxSpeech";
import { MinimaxTTSProvider } from "./MinimaxTTSProvider";
import { QwenTTSProvider } from "./QwenTTSProvider";
import useSettingStore from "@/stores/useSettingStore";

/**
 * TTS Provider Factory
 * 从 ttsProviders / ttsUsageSettings 解析当前语音服务并创建提供商实例。
 * 消费方（编辑器朗读、播客生成、Vibe Learning）统一经 getTTSProvider() 取用。
 */
export class TTSProviderFactory {
  /**
   * 获取当前激活的 TTS 提供商实例（按 ttsUsageSettings.default 解析）
   */
  static getTTSProvider(): ITTSProvider | null {
    const { setting } = useSettingStore.getState();
    const usage = setting.ttsUsageSettings.default;
    if (!usage?.modelId) {
      return null;
    }
    const providerSetting = setting.ttsProviders.find(item => item.id === usage.providerId);
    if (!providerSetting?.apiKey?.trim()) {
      return null;
    }
    return TTSProviderFactory.createFromSetting(providerSetting, usage.modelId);
  }

  /**
   * 获取当前激活的提供商类型
   */
  static getActiveProviderType(): ETTSProvider | null {
    const { setting } = useSettingStore.getState();
    const usage = setting.ttsUsageSettings.default;
    if (!usage) {
      return null;
    }
    const providerSetting = setting.ttsProviders.find(item => item.id === usage.providerId);
    return providerSetting?.providerType ?? null;
  }

  /**
   * 播客脚本 prompt 的 TTS 标签规则入参：从当前语音服务派生（provider 决定
   * 是否允许 Minimax 标签，model 决定是否允许情绪标签），供 LLM 生成脚本时
   * 与实际合成引擎对齐。结构兼容 services/podcast 的 PodcastTTSPromptOptions。
   */
  static getActiveTTSPromptOptions(): {
    provider: ETTSProvider;
    minimaxModel: MinimaxSpeechModel;
  } {
    const { setting } = useSettingStore.getState();
    const usage = setting.ttsUsageSettings.default;
    const providerSetting = setting.ttsProviders.find(item => item.id === usage?.providerId);
    return {
      provider: providerSetting?.providerType ?? ETTSProvider.Minimax,
      minimaxModel: (usage?.modelId as MinimaxSpeechModel) || MINIMAX_DEFAULT_SPEECH_MODEL,
    };
  }

  /**
   * 按 provider 设置与模型创建实例
   */
  static createFromSetting(
    providerSetting: TTSProviderSetting,
    modelId: string
  ): ITTSProvider | null {
    if (!providerSetting.apiKey?.trim() || !modelId) {
      return null;
    }
    switch (providerSetting.providerType) {
      case ETTSProvider.Minimax:
        return new MinimaxTTSProvider({
          apiKey: providerSetting.apiKey,
          baseUrl: providerSetting.baseUrl,
          model: modelId as MinimaxSpeechModel,
        });
      case ETTSProvider.Qwen:
        return new QwenTTSProvider({
          apiKey: providerSetting.apiKey,
          baseUrl: providerSetting.baseUrl,
          model: modelId,
        });
      default:
        return null;
    }
  }
}

export default TTSProviderFactory;
