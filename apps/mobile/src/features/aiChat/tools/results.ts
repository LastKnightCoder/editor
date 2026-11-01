// 工具展示的非组件部分：图片载荷解析、能否画结果卡、分组外框类名。

import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { list, parseObject, str } from "./format";

/** 描边分组：列表、字段组、代码块的外框 */
export const GROUP = "rounded-[14px] shadow-[inset_0_0_0_1px_var(--tau-line-1)]";
/** 分组内相邻行的分隔线 */
export const DIVIDED = "[&>*+*]:border-line-1 [&>*+*]:border-t";

export interface ImagePayload {
  prompt: string;
  images: Array<{ url: string; fileName: string; revisedPrompt?: string }>;
}

/** 取公共 openai-image-result 载荷（metadata.render.payload），历史里缺失时读工具输出 */
export function parseImagePayload(execution: ToolCallExecutionState): ImagePayload | null {
  const render = execution.metadata?.render as { payload?: unknown } | undefined;
  const source =
    render?.payload && typeof render.payload === "object"
      ? (render.payload as Record<string, unknown>)
      : parseObject(execution.output);
  if (!source || source.success === false) return null;
  const images = list(source.images).flatMap(image => {
    const url = str(image.url);
    return url
      ? [{ url, fileName: str(image.fileName) ?? "", revisedPrompt: str(image.revisedPrompt) }]
      : [];
  });
  return images.length ? { prompt: str(source.prompt) ?? "", images } : null;
}

/** 这次写入能画成结果卡 */
export function hasResultCard(execution: ToolCallExecutionState) {
  if (execution.status !== "success") return false;
  const output = parseObject(execution.output);
  return !!output && output.success !== false && !!(output.item || output.event);
}

const DETAIL_TOOLS = new Set([
  "search_knowledge",
  "get_content_markdown",
  "sql_query",
  "query_todos",
  "query_calendar_events",
  "generate_image",
  "edit_image",
  "create_todo",
  "update_todo",
  "set_todo_completed",
  "delete_todo",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
]);

/** 详情面板有专门展示（其余工具只有原始数据，且默认展开） */
export function hasDetailBody(toolName: string, output: Record<string, unknown> | null) {
  return DETAIL_TOOLS.has(toolName) && !!output && output.success !== false;
}
