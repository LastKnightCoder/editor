/**
 * legacy 模块占位注册 —— 侧边栏全部真实模块的过渡 page。
 *
 * 这些模块尚未迁移（status: "legacy"）：点击可导航，PageHost 渲染占位页。
 * M1 建立 LegacyTabPage 兼容层（复用旧 TabContent switch）后逐个替换为真实实现，
 * 替换进度 = 把 navigation.ts 对应条目指向新 page 并删除此处的占位注册。
 *
 * 新增 legacy 模块：在 LEGACY_PAGES 追加一行（key 与 navigation.ts 对齐）。
 */

import { getPageDefinition, registerPageDefinition } from "./registry";
import { getPageMeta, registerPageMeta } from "./core/pageMeta";
import { LegacyPendingPage } from "./LegacyPendingPage";

/** key → 展示名（与 app/navigation.ts 一一对应，别处不要重复维护） */
export const LEGACY_PAGES: Record<string, string> = {
  library: "知识库",
  whiteboard: "白板",
  diary: "日记",
  review: "闪卡复习",
  schedule: "日程",
  todos: "待办",
  pomodoro: "番茄专注",
  feed: "订阅",
  weread: "微信读书",
  questions: "问题管理",
  skills: "Skill 管理",
  collaboration: "协作",
  chat: "AI 对话",
  settings: "设置",
};

/** 为未注册的 legacy key 注册占位 page（幂等；真实 page 注册后自动让位）。 */
export function ensureLegacyPages(): void {
  for (const [key, label] of Object.entries(LEGACY_PAGES)) {
    if (getPageMeta(key)) continue;
    const component = () => <LegacyPendingPage pageKey={key} />;
    registerPageMeta({
      key,
      match: "single",
      keepAlive: "keep",
      label,
      status: "legacy",
      fields: {},
    });
    if (!getPageDefinition(key)) {
      registerPageDefinition({
        key,
        match: "single",
        keepAlive: "keep",
        label,
        status: "legacy",
        fields: {},
        component,
      });
    }
  }
}
