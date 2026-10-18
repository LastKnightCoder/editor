/**
 * TTS 提供商预设目录与系统音色表。
 * 渲染端（设置页新建服务商）与主进程（Qwen 音色列表）共用，避免两处维护漂移。
 */
import { ETTSProvider, type TTSModelSetting, type LegacyTTSProviderSetting } from "@/types/tts";
import { MINIMAX_SPEECH_MODELS } from "@/utils/tts/minimaxSpeech";

export const DEFAULT_QWEN_TTS_BASE_URL = "https://dashscope.aliyuncs.com";
export const DEFAULT_MINIMAX_TTS_BASE_URL = "https://api.minimaxi.com";

export interface TTSProviderPreset {
  providerType: ETTSProvider;
  name: string;
  /** 空串表示该服务商无官方自定地址需求（固定官方域名） */
  baseUrl: string;
  models: TTSModelSetting[];
  description: string;
}

export const TTS_PROVIDER_PRESETS: TTSProviderPreset[] = [
  {
    providerType: ETTSProvider.Qwen,
    name: "阿里云百炼（Qwen）",
    baseUrl: DEFAULT_QWEN_TTS_BASE_URL,
    // 只内置 3.1 模型：内置系统音色表是 _v3.1 系列，与 3.0 模型不通用；
    // 需要 3.0 的用户可手动添加模型并自行填写音色 ID
    models: [{ id: "qwen-audio-3.1-tts-flash", label: "qwen-audio-3.1-tts-flash（推荐）" }],
    description: "阿里云百炼 Qwen 系列语音合成",
  },
  {
    providerType: ETTSProvider.Minimax,
    name: "Minimax",
    baseUrl: "",
    models: MINIMAX_SPEECH_MODELS.map(model => ({ id: model })),
    description: "Minimax 语音合成（speech 系列）",
  },
];

/** 新建 provider 时从预设生成初始配置（不含凭据），id 由调用方补 */
export function createProviderFromPreset(
  preset: TTSProviderPreset
): Omit<LegacyTTSProviderSetting, "id"> {
  return {
    name: preset.name,
    providerType: preset.providerType,
    baseUrl: preset.baseUrl || undefined,
    apiKey: "",
    models: structuredClone(preset.models),
  };
}

/**
 * Qwen 系统音色（音色与模型版本绑定，不能跨模型混用，否则 InvalidParameter）。
 * 仅收录官方文档精品/多语种中文音色；复刻音色由百炼 customization 接口
 * 运行时拉取，与系统音色合并展示。models 为适用的模型 id 列表，
 * 拉取音色列表时按当前模型过滤。
 */
export const QWEN_TTS_SYSTEM_VOICES: Array<{
  voiceId: string;
  name: string;
  category: string;
  models: string[];
}> = [
  {
    voiceId: "yuxiaoyun_v3.1",
    name: "yuxiaoyun",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "qiaoxiaojiao_v3.1",
    name: "qiaoxiaojiao",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "anmingyuan_v3.1",
    name: "anmingyuan",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "wenhuaiqing_v3.1",
    name: "wenhuaiqing",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "anxiaolan_v3.1",
    name: "anxiaolan",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "xieshurou_v3.1",
    name: "xieshurou",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "xuyuyuan_v3.1",
    name: "xuyuyuan",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "baianran_v3.1",
    name: "baianran",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "xuxiaoqiao_v3.1",
    name: "xuxiaoqiao",
    category: "精品中文",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "longanhuan_v3.1",
    name: "longanhuan",
    category: "多语种/方言",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "longanlingxin_v3.1",
    name: "longanlingxin",
    category: "多语种/方言",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "longanfengyue_v3.1",
    name: "longanfengyue",
    category: "多语种/方言",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "xunanchuan_v3.1",
    name: "xunanchuan",
    category: "多语种/方言",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  { voiceId: "libai_v3.1", name: "libai", category: "特色", models: ["qwen-audio-3.1-tts-flash"] },
  {
    voiceId: "longhuohuo_v3.1",
    name: "longhuohuo",
    category: "特色",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "longpaopao_v3.1",
    name: "longpaopao",
    category: "特色",
    models: ["qwen-audio-3.1-tts-flash"],
  },
  {
    voiceId: "longsanshu_v3.1",
    name: "longsanshu",
    category: "特色",
    models: ["qwen-audio-3.1-tts-flash"],
  },
];
