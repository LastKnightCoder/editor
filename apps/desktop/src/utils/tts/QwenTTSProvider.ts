import type {
  ITTSProvider,
  SpeechSynthesisCapability,
  VoiceCloneCapability,
  TTSVoice,
  TTSSynthesizeOptions,
  VoiceCloneOptions,
} from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
import { ttsCommands } from "@/commands/contracts/tts";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { uploadResource } from "@/hooks/useUploadResource";

export interface IQwenConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const QWEN_CLONE_AUDIO_TYPES = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a"];
const QWEN_CLONE_MAX_SIZE = 10 * 1024 * 1024;

/** 音色前缀规范：百炼限定字母/数字且 ≤10 字符，非法字符剔除、空名落到 tau+随机后缀 */
function normalizeClonePrefix(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${cleaned || "tau"}${suffix}`;
}

/**
 * Qwen TTS Provider（阿里云百炼）
 * 合成与音色列表经主进程 tts 模块执行（网络出口收敛主进程：免 CORS）。
 * 声音克隆：百炼只收公网可访问的参考音频 URL，本地文件经用户配置的
 * OSS/S3 资源上传中转获得直链后再提交。
 */
export function createQwenTTSProvider(config: IQwenConfig): ITTSProvider {
  const assertConfigured = () => {
    if (!config.apiKey) {
      throw new Error("百炼 API Key 未配置");
    }
  };

  const synthesis: SpeechSynthesisCapability = {
    async getVoiceList(): Promise<TTSVoice[]> {
      assertConfigured();
      return ttsCommands.voiceList.call({
        providerType: ETTSProvider.Qwen,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      });
    },

    async synthesizeSpeech(
      text: string,
      voiceId: string,
      options?: TTSSynthesizeOptions
    ): Promise<ArrayBuffer> {
      assertConfigured();
      const result = await ttsCommands.synthesize.call({
        providerType: ETTSProvider.Qwen,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        text,
        voiceId,
        options,
      });
      // IPC 返回 Uint8Array；接口契约是 ArrayBuffer，拷贝出精确长度的缓冲
      return result.audio.slice().buffer;
    },
  };

  const cloning: VoiceCloneCapability = {
    /** 上传参考音频并返回公网 URL（作为 cloneVoice 的 fileId）；仅支持公网可访问的资源存储 */
    async uploadReferenceAudio(file: File): Promise<string> {
      assertConfigured();
      if (file.size > QWEN_CLONE_MAX_SIZE) {
        throw new Error("参考音频不能超过 10MB");
      }
      if (file.type && !QWEN_CLONE_AUDIO_TYPES.includes(file.type.toLowerCase())) {
        throw new Error("参考音频仅支持 WAV / MP3 / M4A 格式");
      }

      const { imageBed } = useSettingStore.getState().setting;
      if (imageBed.active !== EImageBed.Plugin) {
        throw new Error(
          "百炼声音复刻需要公网可访问的参考音频：请先在「设置 · 资源存储」配置可公开访问的上传插件"
        );
      }

      const url = await uploadResource(file);
      if (!url) {
        throw new Error("参考音频上传失败，请检查资源存储配置");
      }
      return url;
    },

    async cloneVoice(fileId: string, options: VoiceCloneOptions): Promise<string> {
      assertConfigured();
      return ttsCommands.cloneVoice.call({
        providerType: ETTSProvider.Qwen,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        targetModel: config.model,
        audioUrl: fileId,
        prefix: normalizeClonePrefix(options.voiceName ?? ""),
      });
    },
  };

  return {
    getProviderName: () => ETTSProvider.Qwen,
    isConfigured: () => Boolean(config.apiKey),
    synthesis,
    cloning,
  };
}
