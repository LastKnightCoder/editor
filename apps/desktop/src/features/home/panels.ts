import { homeTranslator } from "./i18n";
/**
 * 首页内置面板：数组顺序即默认布局。ID 随笔记库保存，改名会丢失用户的调整。
 */

import type { HomePanelDefinition } from "./layout";
import { ReviewPanel, SchedulePanel, TodosPanel } from "./views/panels/TodayPanels";
import { RecentEditsPanel } from "./views/panels/RecentEditsPanel";
import { InsightCard } from "./views/InsightCard";
import { WalkDeckPanel } from "./views/WalkDeckPanel";
import { RetroPanel } from "./views/RetroSection";

export const BUILTIN_HOME_PANELS: readonly HomePanelDefinition[] = [
  {
    id: "review",
    get title() {
      return homeTranslator.t("panels.review");
    },
    size: "compact",
    component: ReviewPanel,
    feature: "review",
  },
  {
    id: "todos",
    get title() {
      return homeTranslator.t("panels.todos");
    },
    size: "compact",
    component: TodosPanel,
    feature: "todos",
  },
  {
    id: "schedule",
    get title() {
      return homeTranslator.t("panels.schedule");
    },
    size: "compact",
    component: SchedulePanel,
    feature: "schedule",
  },
  {
    id: "insights",
    get title() {
      return homeTranslator.t("panels.insights");
    },
    size: "wide",
    component: InsightCard,
  },
  {
    id: "recent-edits",
    get title() {
      return homeTranslator.t("panels.recent");
    },
    size: "wide",
    component: RecentEditsPanel,
  },
  {
    id: "walk",
    get title() {
      return homeTranslator.t("panels.walk");
    },
    size: "wide",
    component: WalkDeckPanel,
    feature: "walk",
  },
  {
    id: "retro",
    get title() {
      return homeTranslator.t("panels.retro");
    },
    size: "wide",
    component: RetroPanel,
  },
];
