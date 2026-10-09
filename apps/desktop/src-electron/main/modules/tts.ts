/**
 * TTS 模块：注册 tts:synthesize / tts:voice-list / tts:clone-voice 命令，按 providerType 分发 adapter。
 * 网络出口收敛在主进程：免渲染端 CORS 约束，后续可在此统一接入系统代理。
 * （Minimax 的克隆仍走渲染端 file upload 链路，见 MinimaxTTSProvider 注释。）
 */
import { ttsCommands } from "@/commands/contracts/tts";
import { ETTSProvider } from "@/types/tts";
import { Module } from "../types/module";
import { minimaxGetVoiceList, minimaxSynthesize } from "../tts/minimax";
import { qwenCloneVoice, qwenGetVoiceList, qwenSynthesize } from "../tts/qwen";

class TTSModule implements Module {
  name: string;

  constructor() {
    this.name = "tts";
  }

  async init() {
    ttsCommands.synthesize.register(async (_event, params) => {
      switch (params.providerType) {
        case ETTSProvider.Minimax:
          return minimaxSynthesize(params, params.text, params.voiceId, params.options);
        case ETTSProvider.Qwen:
          return qwenSynthesize(params, params.text, params.voiceId, params.options);
        default:
          throw new Error(`不支持的 TTS 提供商: ${params.providerType}`);
      }
    });

    ttsCommands.voiceList.register(async (_event, params) => {
      switch (params.providerType) {
        case ETTSProvider.Minimax:
          return minimaxGetVoiceList(params);
        case ETTSProvider.Qwen:
          return qwenGetVoiceList(params);
        default:
          throw new Error(`不支持的 TTS 提供商: ${params.providerType}`);
      }
    });

    ttsCommands.cloneVoice.register(async (_event, params) => {
      switch (params.providerType) {
        case ETTSProvider.Qwen:
          return qwenCloneVoice(params, params.targetModel, params.audioUrl, params.prefix);
        default:
          throw new Error(`该 TTS 提供商不支持应用内复刻: ${params.providerType}`);
      }
    });
  }
}

export default new TTSModule();
