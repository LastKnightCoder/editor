import { command } from "@tau/rpc";
import type { ETTSProvider, TTSSynthesizeOptions, TTSVoice } from "@/types/tts";

/** 主进程 TTS 调用的凭据：由渲染端从 ttsProviders 配置逐次带出（网络出口收敛主进程：免 CORS、可统一加代理） */
export interface TTSServiceCredentials {
  providerType: ETTSProvider;
  apiKey: string;
  /** 空 = providerType 对应的官方默认域名 */
  baseUrl?: string;
}

export interface TTSSynthesizeParams extends TTSServiceCredentials {
  model: string;
  text: string;
  voiceId: string;
  options?: TTSSynthesizeOptions;
}

export interface TTSSynthesizeResult {
  audio: Uint8Array;
  mime: string;
}

export interface TTSVoiceListParams extends TTSServiceCredentials {
  model: string;
}

export interface TTSCloneVoiceParams extends TTSServiceCredentials {
  targetModel: string;
  /** 公网可访问的参考音频 URL（渲染端经资源上传配置中转获得） */
  audioUrl: string;
  /** 音色名前缀，百炼限定字母/数字且 ≤10 字符 */
  prefix: string;
}

/**
 * TTS 域命令契约。主进程实现在 src-electron/main/modules/tts.ts，
 * 按 providerType 分发到 minimax/qwen adapter。
 */
export const ttsCommands = {
  synthesize: command<[TTSSynthesizeParams], TTSSynthesizeResult>("tts:synthesize"),
  voiceList: command<[TTSVoiceListParams], TTSVoice[]>("tts:voice-list"),
  /** 仅 Qwen：经公网参考音频 URL 创建复刻音色，返回 voice_id */
  cloneVoice: command<[TTSCloneVoiceParams], string>("tts:clone-voice"),
};
