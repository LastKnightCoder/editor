import { createImageToolDefinitions, getImageToolsEnabled } from "@/tools/openaiImageTools";
import type { MCPProviderDefinition } from "./types";
import { useImageCapabilities } from "@/services/image-capabilities";

export const openAIImageToolsProvider: MCPProviderDefinition = {
  id: "openai-image-tools",
  name: "图片生成工具",
  description: "提供图片生成和图片编辑工具",
  defaultEnabled: true,
  isAvailable: () => getImageToolsEnabled(),
  tools: () => {
    const { canGenerate, canEdit } = useImageCapabilities.getState();
    return createImageToolDefinitions().filter(tool =>
      tool.name === "generate_image" ? canGenerate : canEdit
    );
  },
};
