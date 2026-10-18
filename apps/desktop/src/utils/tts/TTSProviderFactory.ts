import type {
  ITTSProvider,
  SpeechSynthesisCapability,
  VoiceCloneCapability,
  TTSProviderSetting,
} from "@/types/tts";
import { ETTSProvider, isPluginTTS } from "@/types/tts";
import { createPluginTTSProvider } from "./PluginTTSProvider";
import { withPluginTTS } from "@/services/plugin-tts";
import type { MinimaxSpeechModel } from "@/types/minimax";
import { MINIMAX_DEFAULT_SPEECH_MODEL } from "@/utils/tts/minimaxSpeech";
import { createMinimaxTTSProvider } from "./MinimaxTTSProvider";
import { createQwenTTSProvider } from "./QwenTTSProvider";
import useSettingStore from "@/stores/useSettingStore";

/**
 * TTS Provider Factory
 * 从 ttsProviders / ttsUsageSettings 解析当前语音服务并创建提供商实例。
 * 合成类消费方（编辑器朗读、播客生成、Vibe Learning）经 getSpeechSynthesizer()
 * 取朗读合成能力；克隆类消费方经 getVoiceCloner() 取克隆能力——面向能力编程，
 * 不感知具体提供商。
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
    if (!providerSetting || (!isPluginTTS(providerSetting) && !providerSetting.apiKey?.trim())) {
      return null;
    }
    return TTSProviderFactory.createFromSetting(providerSetting, usage.modelId);
  }

  /**
   * 当前服务的朗读合成能力（文本 + 音色 → 音频）；未配置或提供商不具备该能力时为 null
   */
  static getSpeechSynthesizer(): SpeechSynthesisCapability | null {
    return TTSProviderFactory.getTTSProvider()?.synthesis ?? null;
  }

  /**
   * 当前服务的声音克隆能力；未配置或提供商不具备该能力时为 null
   */
  static getVoiceCloner(): VoiceCloneCapability | null {
    return TTSProviderFactory.getTTSProvider()?.cloning ?? null;
  }

  /**
   * 获取当前激活的提供商类型
   */
  static getActiveProviderType(): string | null {
    const { setting } = useSettingStore.getState();
    const usage = setting.ttsUsageSettings.default;
    if (!usage) {
      return null;
    }
    const providerSetting = setting.ttsProviders.find(item => item.id === usage.providerId);
    return providerSetting
      ? isPluginTTS(providerSetting)
        ? providerSetting.pluginId
        : providerSetting.providerType
      : null;
  }

  /**
   * 播客脚本 prompt 的 TTS 标签规则入参：从当前语音服务派生（provider 决定
   * 是否允许 Minimax 标签，model 决定是否允许情绪标签），供 LLM 生成脚本时
   * 与实际合成引擎对齐。结构兼容 services/podcast 的 PodcastTTSPromptOptions。
   */
  static async getActiveTTSPromptOptions(): Promise<
    | {
        provider: ETTSProvider;
        minimaxModel: MinimaxSpeechModel;
      }
    | { textInstructions: string }
  > {
    const { setting } = useSettingStore.getState();
    const usage = setting.ttsUsageSettings.default;
    const providerSetting = setting.ttsProviders.find(item => item.id === usage?.providerId);
    if (providerSetting && isPluginTTS(providerSetting)) {
      if (!usage?.modelId) throw new Error("请先选择语音模型");
      return withPluginTTS(providerSetting, usage.modelId, async instance => ({
        textInstructions: instance.textInstructions ?? "只输出可朗读的纯文本，不加入语音控制标签。",
      }));
    }
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
    if (isPluginTTS(providerSetting))
      return modelId ? createPluginTTSProvider(providerSetting, modelId) : null;
    if (!providerSetting.apiKey?.trim() || !modelId) {
      return null;
    }
    switch (providerSetting.providerType) {
      case ETTSProvider.Minimax:
        return createMinimaxTTSProvider({
          apiKey: providerSetting.apiKey,
          baseUrl: providerSetting.baseUrl,
          model: modelId as MinimaxSpeechModel,
        });
      case ETTSProvider.Qwen:
        return createQwenTTSProvider({
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
