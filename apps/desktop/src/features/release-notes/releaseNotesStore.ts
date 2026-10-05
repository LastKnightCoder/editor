import { create } from "zustand";
import type { ReleaseNote } from "@/commands/updater";

function releaseNotesTitle(notes: ReleaseNote[]): string {
  const newest = notes[0]?.version;
  const oldest = notes.at(-1)?.version;
  if (!newest) return "更新内容";
  return newest === oldest ? `v${newest} 更新内容` : `v${oldest} – v${newest} 更新内容`;
}

interface ReleaseNotesState {
  open: boolean;
  title: string;
  notes: ReleaseNote[];
  /** notes 从新到旧排列 */
  show: (notes: ReleaseNote[]) => void;
  close: () => void;
}

/** 公告弹层的全局开合状态：通知按钮与关于页都经此打开，弹层由 AutoUpdateChecker 挂载 */
export const useReleaseNotesStore = create<ReleaseNotesState>()(set => ({
  open: false,
  title: "",
  notes: [],
  show: notes => set({ open: true, title: releaseNotesTitle(notes), notes }),
  close: () => set({ open: false }),
}));
