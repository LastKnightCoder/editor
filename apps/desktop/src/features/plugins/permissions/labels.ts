import type { PluginPermission } from "@tau/plugins";
import type { PermissionRowState } from "@/app/plugins/permissions";

/** 权限的界面叫法：弹窗与插件详情页共用 */
export const PERMISSION_LABELS: Record<PluginPermission, { label: string; detail: string }> = {
  "cards:read": { label: "读取卡片", detail: "卡片的正文、标签和时间" },
  "articles:read": { label: "读取文章", detail: "文章的标题、正文、标签和时间" },
  "documents:read": { label: "读取项目文档", detail: "项目文档的标题、正文和所属项目" },
  "todos:read": { label: "读取待办", detail: "独立待办和文档里的勾选项" },
  "calendar:read": { label: "读取日程", detail: "日历上的日程安排" },
};

export const PERMISSION_STATE_LABELS: Record<PermissionRowState, string> = {
  always: "始终允许",
  once: "本次允许",
  blocked: "已阻止",
  none: "使用时询问",
};
