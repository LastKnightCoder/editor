/**
 * legacy 模块占位注册 —— 侧边栏全部真实模块的过渡 surface。
 *
 * 这些模块尚未迁移（status: "legacy"）：点击可导航，PageHost 渲染占位页。
 * M1 建立 LegacyTabSurface 兼容层（复用旧 TabContent switch）后逐个替换为真实实现，
 * 替换进度 = 把 navigation.ts 对应条目指向新 surface 并删除此处的占位注册。
 *
 * 新增 legacy 模块：在 LEGACY_SURFACES 追加一行（key 与 navigation.ts 对齐）。
 */

import { getSurfaceDefinition, registerSurfaceDefinition } from "./registry";
import { getSurfaceMeta, registerSurfaceMeta } from "./core/surfaceMeta";
import { LegacyPendingSurface } from "./LegacyPendingSurface";

/** key → 展示名（与 app/navigation.ts 一一对应，别处不要重复维护） */
export const LEGACY_SURFACES: Record<string, string> = {
  cards: "卡片库",
  articles: "文章",
  library: "知识库",
  whiteboard: "白板",
  diary: "日记",
  learning: "学习资料",
  review: "闪卡复习",
  schedule: "日程",
  feed: "订阅",
  weread: "微信读书",
  resources: "资源管理",
  projects: "项目",
  chat: "AI 对话",
  settings: "设置",
};

/** 为未注册的 legacy key 注册占位 surface（幂等；真实 surface 注册后自动让位）。 */
export function ensureLegacySurfaces(): void {
  for (const [key, label] of Object.entries(LEGACY_SURFACES)) {
    if (getSurfaceMeta(key)) continue;
    const component = () => <LegacyPendingSurface surfaceKey={key} />;
    registerSurfaceMeta({
      key,
      kind: "page",
      match: "single",
      keepAlive: "keep",
      label,
      status: "legacy",
      fields: {},
    });
    if (!getSurfaceDefinition(key)) {
      registerSurfaceDefinition({
        key,
        kind: "page",
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
