import type { McpMetadataKey } from "./metadata.messages";
/**
 * 功能专属工具目录：PDF / 视频笔记 / 学习项目三组场景工具的静态展示定义。
 * 实际工具实例在对应功能页面打开时经 toolRegistry.registerScopedTools 注册（只给该场景的对话），
 * 这里用哑参数调用工厂只取 name / description / parameters，供 MCP 页常驻展示——
 * 无论功能页面是否打开，用户都能在这里看到这些工具的存在。
 */

import type { ToolDefinition } from "@/types";
import {
  createGetPdfAnnotationsTool,
  createGetPdfBookmarksTool,
  createGetPdfDocumentInfoTool,
  createGetPdfOutlineTool,
  createPdfSearchTool,
  createReadPdfPageRangeTool,
} from "@/tools/pdfSearchTool";
import {
  createGetVideoNoteTranscriptRangeTool,
  createVideoNoteSearchTool,
} from "@/tools/videoNoteSearchTool";
import { createUnifiedVibeLearningTool } from "@/tools/vibeLearningSearchTool";
import { createVibeLearningProductTools } from "@/features/vibe-learning/views/VibeLearningView/chat/productTools";

export interface ScopedToolGroup {
  /** 分组标识（同时也是 ServerIcon 的图标匹配键） */
  id: string;
  labelKey: McpMetadataKey;
  descriptionKey: McpMetadataKey;
  tools: Array<{ name: string; description: string; parameters?: ToolDefinition["parameters"] }>;
}

const toToolSummaries = (definitions: ToolDefinition[]) =>
  definitions.map(({ name, description, parameters }) => ({ name, description, parameters }));

export const SCOPED_TOOL_GROUPS: ScopedToolGroup[] = [
  {
    id: "scoped-pdf",
    labelKey: "scope.pdf.name",
    descriptionKey: "scope.pdf.description",
    tools: toToolSummaries([
      createPdfSearchTool(0, ""),
      createGetPdfDocumentInfoTool(0, ""),
      createGetPdfOutlineTool(0, ""),
      createReadPdfPageRangeTool(0, ""),
      createGetPdfAnnotationsTool(0),
      createGetPdfBookmarksTool(0),
    ]),
  },
  {
    id: "scoped-video-note",
    labelKey: "scope.video.name",
    descriptionKey: "scope.video.description",
    tools: toToolSummaries([
      createVideoNoteSearchTool(0, ""),
      createGetVideoNoteTranscriptRangeTool(0),
    ]),
  },
  {
    id: "scoped-vibe-learning",
    labelKey: "scope.learning.name",
    descriptionKey: "scope.learning.description",
    tools: toToolSummaries([
      createUnifiedVibeLearningTool(0, ""),
      ...createVibeLearningProductTools(0, ""),
    ]),
  },
];
