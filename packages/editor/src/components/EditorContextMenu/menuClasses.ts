/**
 * 玻璃菜单的共享类串：右键菜单（EditorContextMenu）与块面板（BlockPanel）共用同一套外观。
 * 需要覆盖尺寸 / 层级 / 内边距时经 cn() 合并（如块面板子菜单的 min-w、z-index）。
 */

/** 毛玻璃表面：底色 + 模糊饱和 + 浮层阴影（不含描边，子菜单的描边画在 ::before 上） */
export const menuGlassClass =
  "bg-[var(--ed-glass-bg)] backdrop-blur-[18px] backdrop-saturate-[180%] shadow-[var(--ed-shadow-float)]";

/** 菜单主容器（fixed 定位，left/top 由调用方内联） */
export const menuPanelClass = `fixed z-[9999] w-max min-w-[180px] max-w-[280px] rounded-[18px] border border-solid border-[var(--ed-border-soft)] p-[8px] text-[var(--ed-text)] animate-[ed-menu-fade-in_120ms_ease-out] ${menuGlassClass}`;

export const menuListClass = "flex flex-col gap-[2px]";

/** 菜单项包装器（按钮 + 子菜单的定位上下文） */
export const menuItemWrapperClass = "relative";

export const menuItemClass =
  "flex w-full cursor-pointer items-center gap-[10px] whitespace-nowrap rounded-[14px] border-none bg-transparent p-[8px_12px] text-left text-[14px] text-inherit transition-[background-color,color] duration-150 ease-[ease] enabled:hover:bg-[var(--ed-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50";

/** 菜单项右侧箭头（表示有子菜单） */
export const menuItemArrowClass = "ml-auto flex items-center justify-center text-[12px] opacity-60";
