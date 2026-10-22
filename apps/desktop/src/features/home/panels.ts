/**
 * 首页内置面板（D-182）：数组顺序即默认布局。ID 随笔记库保存，改名会丢失用户的调整。
 */

import type { HomePanelDefinition } from "./layout";
import { ReviewPanel, SchedulePanel, TodosPanel } from "./views/panels/TodayPanels";
import { RecentEditsPanel } from "./views/panels/RecentEditsPanel";
import { QuestionsPanel } from "./views/panels/QuestionsPanel";
import { InsightCard } from "./views/InsightCard";
import { WalkDeckPanel } from "./views/WalkDeckPanel";
import { RetroPanel } from "./views/RetroSection";

export const BUILTIN_HOME_PANELS: readonly HomePanelDefinition[] = [
  { id: "review", title: "复习", size: "compact", component: ReviewPanel },
  { id: "todos", title: "待办", size: "compact", component: TodosPanel },
  { id: "schedule", title: "日程", size: "compact", component: SchedulePanel },
  { id: "insights", title: "洞见", size: "wide", component: InsightCard },
  { id: "recent-edits", title: "最近编辑", size: "wide", component: RecentEditsPanel },
  { id: "questions", title: "探究中的问题", size: "wide", component: QuestionsPanel },
  { id: "walk", title: "今日漫步", size: "wide", component: WalkDeckPanel },
  { id: "retro", title: "回顾", size: "wide", component: RetroPanel },
];
