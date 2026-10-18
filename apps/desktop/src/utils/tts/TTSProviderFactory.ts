import type {
  ITTSProvider,
  SpeechSynthesisCapability,
  VoiceCloneCapability,
  TTSProviderSetting,
} from "@/types/tts";
import { createPluginTTSProvider } from "./PluginTTSProvider";
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
    if (!providerSetting) {
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
    return providerSetting?.pluginId ?? null;
  }

  /**
   * 按 provider 设置与模型创建实例
   */
  static createFromSetting(
    providerSetting: TTSProviderSetting,
    modelId: string
  ): ITTSProvider | null {
    return modelId ? createPluginTTSProvider(providerSetting, modelId) : null;
  }
}

export default TTSProviderFactory;
