import useSettingStore from "@/stores/useSettingStore";
import {
  createOpenAIImageToolDefinitions,
  getOpenAIImageToolsEnabled,
} from "@/tools/openaiImageTools";
import type { MCPProviderDefinition } from "./types";

export const openAIImageToolsProvider: MCPProviderDefinition = {
  id: "openai-image-tools",
  name: "图片生成工具",
  description: "提供图片生成和图片编辑工具",
  defaultEnabled: true,
  isAvailable: () =>
    getOpenAIImageToolsEnabled(
      useSettingStore.getState().setting.imageGeneration,
    ),
  tools: () => createOpenAIImageToolDefinitions(),
};
