/**
 * 功能开关的说明文案与组合图标：设置 › 功能与首次启动选用途共用。
 */

import { Bot, CalendarDays, GraduationCap, NotebookPen, type LucideIcon } from "lucide-react";

/** 每个功能一句话：它是什么、关掉会少什么 */
export const FEATURE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  schedule: "日历视图与提醒，今日显示当天日程",
  todos: "按项目管理待办，文档里勾的待办也汇总在这",
  diary: "每天一页",
  pomodoro: "专注计时与小窗",
  cards: "一张卡片记一个点，用标签组织",
  articles: "长文写作",
  projects: "用文档树梳理一个主题",
  whiteboard: "无限画布、手写与图形",
  databases: "表格、看板等结构化数据",
  "vibe-learning": "围绕一组资料提问、生成学习材料",
  pdfs: "阅读与标注 PDF",
  review: "从任何内容生成闪卡、按记忆曲线复习 · 关掉后各处的「制卡」入口一起收起",
  walk: "随机重温旧内容 · 今日的「今日漫步」一起收起",
  chat: "与模型对话，可引用笔记 · 关掉后右侧的 AI 对话栏也不再出现",
  skills: "对话里可调用的技能",
  mcp: "对话里可调用的外部工具",
  collaboration: "邀请别人实时编辑同一份内容",
  publish: "把内容发布成静态网站",
};

export const PRESET_ICONS: Readonly<Record<string, LucideIcon>> = {
  writing: NotebookPen,
  learning: GraduationCap,
  planning: CalendarDays,
  ai: Bot,
};
