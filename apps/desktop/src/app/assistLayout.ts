/**
 * 右侧辅助栏的空间裁决（纯函数，D-047）：打开后正文太窄时先收起侧栏换空间，
 * 仍不够才退化为覆盖浮层——任何窗口宽度下正文都不会被挤到不可读。
 */

import { SIDEBAR_COLLAPSED_W } from "./shellStore";

/** 侧栏拖宽热区宽度（AppShell 网格第二列） */
const RESIZER_W = 4;
/** 辅助栏与窗口右 / 下缘的间距（同页面底部留白 pb-[18px]） */
export const ASSIST_GUTTER = 18;
/** 并排时正文最小宽度（约一列正文阅读宽 + 页边距）：低于此值先收起侧栏 */
export const MAIN_MIN_BESIDE = 720;
/** 收起侧栏后仍低于此值：改为覆盖浮层，不再挤压正文 */
export const MAIN_MIN_OVERLAY = 560;

export interface AssistLayoutInput {
  windowWidth: number;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  assistWidth: number;
}

export interface AssistLayout {
  mode: "beside" | "overlay";
  /** 需要为辅助栏自动收起侧栏 */
  collapseSidebar: boolean;
  /** 裁决后的正文可用宽度（覆盖浮层时为不含辅助栏的整宽） */
  mainWidth: number;
}

export function resolveAssistLayout({
  windowWidth,
  sidebarWidth,
  sidebarCollapsed,
  assistWidth,
}: AssistLayoutInput): AssistLayout {
  const rest = (sidebar: number) => windowWidth - sidebar - RESIZER_W;
  const beside = (sidebar: number) => rest(sidebar) - assistWidth - ASSIST_GUTTER;

  const current = sidebarCollapsed ? SIDEBAR_COLLAPSED_W : sidebarWidth;
  if (beside(current) >= MAIN_MIN_BESIDE) {
    return { mode: "beside", collapseSidebar: false, mainWidth: beside(current) };
  }
  if (beside(SIDEBAR_COLLAPSED_W) >= MAIN_MIN_OVERLAY) {
    return {
      mode: "beside",
      collapseSidebar: !sidebarCollapsed,
      mainWidth: beside(SIDEBAR_COLLAPSED_W),
    };
  }
  // 收起也不够：覆盖浮层不挤正文，侧栏保持用户原状
  return { mode: "overlay", collapseSidebar: false, mainWidth: rest(current) };
}
