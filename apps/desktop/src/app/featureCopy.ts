/**
 * 功能开关的说明文案与组合图标：设置 › 功能与首次启动选用途共用。
 */

import type { FeatureCopyKey } from "./features.i18n";
import { Bot, CalendarDays, GraduationCap, NotebookPen, type LucideIcon } from "lucide-react";

/** 每个功能一句话：它是什么、关掉会少什么 */
export const FEATURE_DESCRIPTION_KEYS: Readonly<Record<string, FeatureCopyKey>> = {
  schedule: "description.schedule",
  todos: "description.todos",
  diary: "description.diary",
  pomodoro: "description.pomodoro",
  cards: "description.cards",
  articles: "description.articles",
  projects: "description.projects",
  whiteboard: "description.whiteboard",
  databases: "description.databases",
  "vibe-learning": "description.vibe-learning",
  pdfs: "description.pdfs",
  review: "description.review",
  walk: "description.walk",
  chat: "description.chat",
  skills: "description.skills",
  mcp: "description.mcp",
  collaboration: "description.collaboration",
  publish: "description.publish",
};

export const PRESET_ICONS: Readonly<Record<string, LucideIcon>> = {
  writing: NotebookPen,
  learning: GraduationCap,
  planning: CalendarDays,
  ai: Bot,
};
