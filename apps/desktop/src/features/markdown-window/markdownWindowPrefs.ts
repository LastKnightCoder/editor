import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Markdown 窗口偏好（持久化，所有 Markdown 窗口共用） */
interface MarkdownWindowPrefs {
  sidebarOpen: boolean;
  /** 左栏宽度（拖拽调宽，双击手柄回默认） */
  sidebarWidth: number;
  /** 大纲开关：sheet 够宽时贴正文右缘常驻，不够时由标题栏按钮弹层 */
  outlineOpen: boolean;
  /** 宽版心（1040）/ 标准（720） */
  wide: boolean;
  /** 显示点开头的文件、node_modules 与不支持的文件类型 */
  showAllFiles: boolean;
  /** 各根目录下展开的文件夹 */
  expanded: Record<string, string[]>;
  setSidebarOpen(open: boolean): void;
  setSidebarWidth(width: number): void;
  toggleOutline(): void;
  toggleWide(): void;
  toggleShowAllFiles(): void;
  setExpanded(root: string, paths: string[]): void;
}

export const SIDEBAR_DEFAULT_WIDTH = 264;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 400;

// 展开记忆只留最近的若干个根目录，避免无限增长
const MAX_REMEMBERED_ROOTS = 20;

const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));

export const useMarkdownWindowPrefs = create<MarkdownWindowPrefs>()(
  persist(
    set => ({
      sidebarOpen: true,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      outlineOpen: true,
      wide: false,
      showAllFiles: false,
      expanded: {},
      setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
      setSidebarWidth: width => set({ sidebarWidth: clampSidebarWidth(width) }),
      toggleOutline: () => set(state => ({ outlineOpen: !state.outlineOpen })),
      toggleWide: () => set(state => ({ wide: !state.wide })),
      toggleShowAllFiles: () => set(state => ({ showAllFiles: !state.showAllFiles })),
      setExpanded: (root, paths) =>
        set(state => {
          const rest = Object.entries(state.expanded).filter(([key]) => key !== root);
          return {
            expanded: Object.fromEntries([
              ...rest.slice(-(MAX_REMEMBERED_ROOTS - 1)),
              [root, paths],
            ]),
          };
        }),
    }),
    { name: "tau-markdown-window-prefs" }
  )
);
