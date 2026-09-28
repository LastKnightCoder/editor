import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarTab = "files" | "outline";

/** Markdown 窗口偏好（持久化，所有 Markdown 窗口共用） */
interface MarkdownWindowPrefs {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  /** 宽版心（1040）/ 标准（720） */
  wide: boolean;
  /** 显示点开头的文件、node_modules 与不支持的文件类型 */
  showAllFiles: boolean;
  /** 各根目录下展开的文件夹 */
  expanded: Record<string, string[]>;
  setSidebarOpen(open: boolean): void;
  setSidebarTab(tab: SidebarTab): void;
  toggleWide(): void;
  toggleShowAllFiles(): void;
  setExpanded(root: string, paths: string[]): void;
}

// 展开记忆只留最近的若干个根目录，避免无限增长
const MAX_REMEMBERED_ROOTS = 20;

export const useMarkdownWindowPrefs = create<MarkdownWindowPrefs>()(
  persist(
    set => ({
      sidebarOpen: true,
      sidebarTab: "files",
      wide: false,
      showAllFiles: false,
      expanded: {},
      setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
      setSidebarTab: sidebarTab => set({ sidebarTab }),
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
