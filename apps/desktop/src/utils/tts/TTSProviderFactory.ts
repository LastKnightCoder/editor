import type { ITTSProvider } from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
import { MinimaxTTSProvider } from "./MinimaxTTSProvider";
import { DoubaoTTSProvider } from "./DoubaoTTSProvider";
import useSettingStore from "@/stores/useSettingStore";

/**
 * TTS Provider Factory
 * 根据用户设置创建对应的 TTS 提供商实例
 */
export class TTSProviderFactory {
  /**
   * 获取当前激活的 TTS 提供商实例
   */
  static getTTSProvider(): ITTSProvider | null {
    const { setting } = useSettingStore.getState();
    const integration = setting.integration;
    const podcastTTS = integration.podcastTTS;

    if (!podcastTTS) {
      // 如果没有 podcastTTS 配置，返回 null
      return null;
    }

    const active = podcastTTS.active;

    switch (active) {
      case ETTSProvider.Minimax: {
        const minimaxConfig = integration.minimax;
        if (!minimaxConfig?.apiKey) {
          return null;
        }
        return new MinimaxTTSProvider({
          apiKey: minimaxConfig.apiKey,
        });
      }

      case ETTSProvider.Doubao: {
        const doubaoConfig = podcastTTS.doubao;
        if (!doubaoConfig) {
          return null;
        }
        return new DoubaoTTSProvider({
          accessToken: doubaoConfig.accessToken,
          secretKey: doubaoConfig.secretKey,
          appid: doubaoConfig.appid,
          token: doubaoConfig.token,
        });
      }

      default:
        return null;
    }
  }

  /**
   * 根据指定的提供商类型创建实例
   */
  static createProvider(providerType: ETTSProvider): ITTSProvider | null {
    const { setting } = useSettingStore.getState();
    const integration = setting.integration;

    switch (providerType) {
      case ETTSProvider.Minimax: {
        const minimaxConfig = integration.minimax;
        if (!minimaxConfig?.apiKey) {
          return null;
        }
        return new MinimaxTTSProvider({
          apiKey: minimaxConfig.apiKey,
        });
      }

      case ETTSProvider.Doubao: {
        const doubaoConfig = integration.podcastTTS?.doubao;
        if (!doubaoConfig) {
          return null;
        }
        return new DoubaoTTSProvider({
          accessToken: doubaoConfig.accessToken,
          secretKey: doubaoConfig.secretKey,
          appid: doubaoConfig.appid,
          token: doubaoConfig.token,
        });
      }

      default:
        return null;
    }
  }

  /**
   * 检查指定提供商是否已配置
   */
  static isProviderConfigured(providerType: ETTSProvider): boolean {
    const provider = TTSProviderFactory.createProvider(providerType);
    return provider?.isConfigured() ?? false;
  }

  /**
   * 获取当前激活的提供商类型
   */
  static getActiveProviderType(): ETTSProvider | null {
    const { setting } = useSettingStore.getState();
    return setting.integration.podcastTTS?.active ?? null;
  }
}

export default TTSProviderFactory;
