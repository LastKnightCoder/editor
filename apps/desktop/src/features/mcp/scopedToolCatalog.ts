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
  label: string;
  description: string;
  tools: Array<{ name: string; description: string; parameters?: ToolDefinition["parameters"] }>;
}

const toToolSummaries = (definitions: ToolDefinition[]) =>
  definitions.map(({ name, description, parameters }) => ({ name, description, parameters }));

export const SCOPED_TOOL_GROUPS: ScopedToolGroup[] = [
  {
    id: "scoped-pdf",
    label: "PDF 文档",
    description: "在 PDF 阅读页的对话中，AI 可检索 PDF 原文、按页读取，并查看目录、批注与书签。",
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
    label: "视频笔记",
    description: "在视频笔记页的对话中，AI 可搜索转录内容并按时间段读取原文。",
    tools: toToolSummaries([
      createVideoNoteSearchTool(0, ""),
      createGetVideoNoteTranscriptRangeTool(0),
    ]),
  },
  {
    id: "scoped-vibe-learning",
    label: "学习项目",
    description: "在学习项目（Notebook）的对话中，AI 可检索项目资料、生成学习内容并保存为笔记。",
    tools: toToolSummaries([
      createUnifiedVibeLearningTool(0, ""),
      ...createVibeLearningProductTools(0, ""),
    ]),
  },
];
