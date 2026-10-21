import {
  PLUGIN_AI_CAPABILITIES,
  type PluginPermission,
  type PluginAICapability,
} from "@tau/plugins";
import type { PermissionRowState } from "@/app/plugins/permissions";

/** 权限的界面叫法：弹窗与插件详情页共用 */
export const PERMISSION_LABELS: Record<PluginPermission, { label: string; detail: string }> = {
  "cards:read": { label: "读取卡片", detail: "卡片的正文、标签和时间" },
  "cards:write": { label: "新建和修改卡片", detail: "包括卡片正文、标签和置顶" },
  "cards:delete": { label: "删除卡片", detail: "删除后 7 天内可在插件详情页恢复" },
  "articles:read": { label: "读取文章", detail: "文章的标题、正文、标签和时间" },
  "articles:write": { label: "新建和修改文章", detail: "包括文章标题、正文和标签" },
  "articles:delete": { label: "删除文章", detail: "删除后 7 天内可在插件详情页恢复" },
  "documents:read": { label: "读取项目文档", detail: "项目文档的标题、正文和所属项目" },
  "documents:write": {
    label: "新建和修改项目文档",
    detail: "在项目中新建与移动文档，修改标题、标签和正文",
  },
  "whiteboards:read": { label: "读取白板", detail: "白板的标题、说明、标签和页数" },
  "whiteboards:write": { label: "新建和修改白板", detail: "白板的标题、说明和标签，不含画板内容" },
  "projects:read": { label: "读取项目", detail: "项目的标题和文档目录" },
  "projects:write": { label: "新建和修改项目", detail: "项目的标题、归档和置顶" },
  "todos:read": { label: "读取待办", detail: "独立待办和文档里的勾选项" },
  "todos:write": { label: "新建和修改待办", detail: "包括标记完成和修改截止时间" },
  "todos:delete": { label: "删除待办", detail: "删除后 7 天内可在插件详情页恢复" },
  "calendar:read": { label: "读取日程", detail: "日历上的日程安排" },
  "calendar:write": { label: "新建和修改日程", detail: "日历上的日程安排" },
  "calendar:delete": { label: "删除日程", detail: "删除后 7 天内可在插件详情页恢复" },
  "notebooks:read": { label: "读取 Notebook", detail: "Notebook 的标题、说明和资料列表" },
  "materials:read": { label: "读取摘录与标注", detail: "划线、PDF 标注和剪藏的原文、想法与出处" },
  "chats:read": {
    label: "读取对话信息",
    detail: "AI 对话的标题、场景、消息数和时间，不含消息内容",
  },
  "flashcards:read": { label: "读取闪卡卡组", detail: "卡组名称与说明" },
  "flashcards:write": { label: "创建闪卡", detail: "创建卡组与闪卡，包括 AI 自动保存" },
  ...(Object.fromEntries(
    Object.entries(PLUGIN_AI_CAPABILITIES).map(([id, { name }]) => [
      `ai:${id}`,
      {
        label: `使用${name} AI`,
        detail: "沿用应用对应功能的模型分配，可能产生模型费用，用量计入此插件",
      },
    ])
  ) as Record<`ai:${PluginAICapability}`, { label: string; detail: string }>),
};

export const PERMISSION_STATE_LABELS: Record<PermissionRowState, string> = {
  always: "始终允许",
  once: "本次允许",
  blocked: "已阻止",
  none: "使用时询问",
};
