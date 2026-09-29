import useSettingStore from "@/stores/useSettingStore";
import type { TranscriptionOptions } from "@/commands/transcription";

/**
 * 检查 LLM 优化配置是否完整
 * @returns 配置是否完整
 */
export function checkLLMOptimizationConfig(): {
  isConfigured: boolean;
  message?: string;
} {
  const { llmProviders: llmConfigs, llmUsageSettings } = useSettingStore.getState().setting;

  const transcriptionOptimization = llmUsageSettings.transcriptionOptimization;

  if (!transcriptionOptimization) {
    return {
      isConfigured: false,
      message: "未配置转录断句优化模型，请在「大语言模型」→「使用配置」中配置",
    };
  }

  const provider = llmConfigs.find(config => config.id === transcriptionOptimization.providerId);

  if (!provider) {
    return {
      isConfigured: false,
      message: "找不到配置的大模型提供商，请重新配置",
    };
  }

  const model = provider.models?.find(m => m.id === transcriptionOptimization.modelId);

  if (!model) {
    return {
      isConfigured: false,
      message: "找不到配置的模型，请重新配置",
    };
  }

  return { isConfigured: true };
}

/** 打开新设置对话框并直达 LLM 分区（旧弹窗的 llm tab 已随 legacy 页退役） */
export function openLLMSettingsSection(): void {
  void import("@/app/settingsStore").then(({ useSettingsStore }) => {
    useSettingsStore.getState().openSettings("llm");
  });
}

/**
 * 检查转录配置是否需要 LLM 优化
 * @returns 是否需要 LLM 优化以及配置状态
 */
export function checkTranscriptionLLMRequirement(): {
  needsLLM: boolean;
  isConfigured: boolean;
  errorMessage?: string;
} {
  const { segmentationLevel, useLLMOptimization } = useSettingStore.getState().setting.misc
    .transcription || {
    segmentationLevel: "sentence",
    useLLMOptimization: false,
  };

  // 如果没有启用 LLM 优化或使用句子级别，不需要 LLM
  if (!useLLMOptimization || segmentationLevel === "sentence") {
    return {
      needsLLM: false,
      isConfigured: true,
    };
  }

  // 需要 LLM，检查配置
  const { isConfigured, message } = checkLLMOptimizationConfig();

  return {
    needsLLM: true,
    isConfigured,
    errorMessage: message,
  };
}

/**
 * 从设置中准备转录选项
 * @param userOptions 用户提供的选项
 * @returns 合并了设置的完整选项
 */
export function prepareTranscriptionOptions(
  userOptions: Partial<TranscriptionOptions> = {}
): TranscriptionOptions {
  const { transcription, misc } = useSettingStore.getState().setting;

  // 获取转录行为设置
  const { segmentationLevel = "sentence", useLLMOptimization = false } = misc.transcription || {};

  // 模型名带引擎前缀：Windows "faster-whisper-base"、macOS "whisper-cpp-base" -> "base"
  const modelSize =
    transcription.currentModel?.replace(/^(faster-whisper|whisper-cpp)-/, "") || "base";

  // 合并选项（device 由后端根据已安装程序自动检测）
  return {
    modelSize: modelSize as any,
    sentenceLevel: segmentationLevel === "sentence",
    useLLMOptimization,
    ...userOptions,
  };
}
