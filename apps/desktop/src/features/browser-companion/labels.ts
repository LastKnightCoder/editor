import type { CompanionScope } from "@tau/shared/browser-companion";

/** 浏览器扩展权限的界面叫法（授权弹窗与设置页共用） */
export const SCOPE_LABELS: Record<CompanionScope, { label: string; detail: string }> = {
  chat: { label: "用 Tau 的模型对话", detail: "只在你提问时发送网页内容" },
  annotations: { label: "读写网页标注", detail: "高亮与批注保存为 Tau 里的网页划线" },
  notes: { label: "保存页面笔记", detail: "笔记存为一张带来源链接的卡片" },
  tools: {
    label: "使用 Tau 里的工具",
    detail: "检索笔记、管理待办与日程、Skill 与 MCP；需要确认的操作按 Tau 的工具权限设置询问",
  },
};

export const clientLabel = (info: { browser: string; os: string }) =>
  info.os ? `${info.browser} · ${info.os}` : info.browser;
