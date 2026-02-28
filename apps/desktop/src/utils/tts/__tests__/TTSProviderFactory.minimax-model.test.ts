import { afterEach, describe, expect, it } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import { ETTSProvider } from "@/types/tts";
import { TTSProviderFactory } from "@/utils/tts/TTSProviderFactory";

describe("utils/tts/TTSProviderFactory minimaxModel", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);

  afterEach(() => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: structuredClone(initialSetting),
    }));
  });

  it("应将 minimaxModel 从设置透传到 MinimaxProvider", () => {
    const current = useSettingStore.getState().setting;
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...current,
        integration: {
          ...current.integration,
          minimax: {
            ...current.integration.minimax,
            enabled: true,
            apiKey: "test-key",
          },
          podcastTTS: {
            ...current.integration.podcastTTS,
            active: ETTSProvider.Minimax,
            minimaxModel: "speech-2.8-turbo",
          },
        },
      },
    }));

    const provider = TTSProviderFactory.getTTSProvider() as {
      config: { model: string };
    } | null;
    expect(provider).not.toBeNull();
    expect(provider?.config.model).toBe("speech-2.8-turbo");
  });
});
