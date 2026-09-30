import type { ToolParameterSchema } from "@/types";
import { getVersions } from "@/commands/extra";
import { collectAppContext } from "@/services/app-context";
import {
  buildInlineEditorContextFromSnapshot,
  getActiveEditingSession,
} from "@/services/content-editing";
import { getPageNavigation } from "@/services/page-navigation";
import { current as currentPageEntry } from "@/page/core/stackMachine";
import { getPageMeta } from "@/page/core/pageMeta";
import type { MCPProviderDefinition } from "./types";

/** 页面栈可能尚未绑定（主窗口未就绪 / 非主窗口上下文），读不到就报 null */
const buildPageContext = () => {
  try {
    const entry = currentPageEntry(getPageNavigation().state);
    if (!entry) return null;
    return {
      key: entry.key,
      label: getPageMeta(entry.key)?.label ?? entry.key,
      params: entry.params,
    };
  } catch {
    return null;
  }
};

const buildEditorContext = () => {
  const session = getActiveEditingSession();
  if (!session) return null;
  const inline = buildInlineEditorContextFromSnapshot({
    snapshot: session.snapshot,
    snapshotSource: "active-session",
    selection: session.selection,
    target: {
      contentId: session.contentId,
      entityType: session.entityType,
      entityId: session.entityId,
      source: "active-session",
    },
  });
  return {
    entityType: session.entityType,
    entityId: session.entityId,
    contentId: session.contentId,
    focused: session.focused,
    hasSelection: Boolean(session.selection && !session.selection.isCollapsed),
    selectedMarkdown: inline.selectedMarkdown,
    currentBlockMarkdown: inline.currentBlockMarkdown,
    selectionBefore: inline.selectionBefore,
    selectionAfter: inline.selectionAfter,
    documentLength: inline.documentLength,
  };
};

export const contextToolsProvider: MCPProviderDefinition = {
  id: "context-tools",
  name: "上下文感知工具",
  description:
    "感知应用的当前状态：正在查看的页面、聚焦的编辑器（含选中文本与光标所在块）、各页面打开的详情（待办、日程等），以及应用版本等全局信息。",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_current_context",
      risk: "read",
      description:
        "获取用户当前的上下文：正在查看的页面（key/名称/参数）、聚焦的编辑器（正文 contentId、选中文本、光标所在块及前后文）、以及当前打开的详情（待办详情、日程详情等）。" +
        "当用户说「修改当前页面 / 这段话 / 光标处」等指代性请求时，先调用本工具定位目标：返回的 contentId 可直接传给 get_content_markdown、" +
        "apply_content_edit_operations 等内容编辑工具；选区为空时操作目标默认是光标所在块或全文。",
      parameters: {
        type: "object",
        properties: {} as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async () => {
        const result = {
          page: buildPageContext(),
          editor: buildEditorContext(),
          details: collectAppContext(),
        };
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "get_app_info",
      risk: "read",
      description:
        "获取应用的全局信息：应用版本、运行时版本（Node / Electron / Chrome）、平台与语言环境。",
      parameters: {
        type: "object",
        properties: {} as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async () => {
        const versions = await getVersions().catch(() => null);
        const info = {
          appVersion: versions?.app ?? null,
          runtime: versions
            ? { node: versions.node, electron: versions.electron, chrome: versions.chrome }
            : null,
          platform: navigator.platform,
          language: navigator.language,
          locale: Intl.DateTimeFormat().resolvedOptions().locale ?? null,
        };
        return {
          content: JSON.stringify(info, null, 2),
        };
      },
    },
  ],
};
