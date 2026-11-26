import diagnostics from "./transcription-diagnostics.json";
import useSettingStore from "@/stores/useSettingStore";
import { transcriptionDefaults } from "../../shared/local-transcription";

/**
 * 检查 LLM 优化配置是否完整
 * @returns 配置是否完整
 */
export function checkLLMOptimizationConfig(setting = useSettingStore.getState().setting): {
  isConfigured: boolean;
  message?: string;
  reason?: keyof typeof diagnostics;
} {
  const { llmProviders: llmConfigs, llmUsageSettings } = setting;

  const transcriptionOptimization = llmUsageSettings.transcriptionOptimization;

  if (!transcriptionOptimization) {
    return {
      isConfigured: false,
      reason: "assignment",
      message: diagnostics.assignment,
    };
  }

  const provider = llmConfigs.find(config => config.id === transcriptionOptimization.providerId);

  if (!provider) {
    return {
      isConfigured: false,
      reason: "provider",
      message: diagnostics.provider,
    };
  }

  const model = provider.models?.find(m => m.id === transcriptionOptimization.modelId);

  if (!model) {
    return {
      isConfigured: false,
      reason: "model",
      message: diagnostics.model,
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
