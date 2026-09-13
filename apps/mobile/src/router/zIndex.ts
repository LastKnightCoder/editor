// 全局层叠层级契约：screen 包裹层(动态) < overlay 容器 < 弹层/工具栏 < Toast < DevTools。
// 页面组件自身的 z-50 位于 PageHost wrapper 的层叠上下文内（wrapper 有 transform），
// 不参与全局层叠，无需对齐本表。
// 不变式：MAX_LIVE_SCREENS(10) 时 screen 层最大 zIndex = SCREEN_TOP(40) < OVERLAY_SHEET(50)。
// 例外：tab 滑动跟手层临时占用 SCREEN_TOP±1 / SCREEN_TOP-2（均 < 50），落定即恢复。

export const SCREEN_BASE = 10;
export const SCREEN_TOP = 40;

export const Z_INDEX = {
  /** overlay 容器（SnapSheet/PanContainer/Sidebar），对应原 tailwind z-50 */
  OVERLAY_SHEET: 50,
  /** BottomSheet/编辑器工具栏/contentLink 弹层，对应原 tailwind z-70 */
  POPOVER: 70,
  /** 确认对话框/选择面板，叠在弹层之上、Toast 之下 */
  CONFIRM: 75,
  /** 全局 Toast，对应原 z-[80] */
  TOAST: 80,
  /** 开发面板 */
  DEVTOOLS: 9999,
} as const;
