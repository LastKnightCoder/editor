import useSettingStore from "@/stores/useSettingStore";
import { transcriptionDefaults } from "../../shared/local-transcription";

/**
 * 检查 LLM 优化配置是否完整
 * @returns 配置是否完整
 */
export function checkLLMOptimizationConfig(setting = useSettingStore.getState().setting): {
  isConfigured: boolean;
  message?: string;
} {
  const { llmProviders: llmConfigs, llmUsageSettings } = setting;

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
    useSettingsStore.setState({ open: true, section: "llm", llmTab: "assignment" });
  });
}

export function defaultTranscriptionSelection() {
  const { transcription, misc } = useSettingStore.getState().setting;
  return transcriptionDefaults(transcription, misc.transcription);
}
