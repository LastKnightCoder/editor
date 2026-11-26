import { create } from "zustand";
import type { ReleaseNote } from "@/commands/updater";

interface ReleaseNotesState {
  open: boolean;
  notes: ReleaseNote[];
  /** 应答区提供「立即更新」主动作（发现新版本通知打开时）；升级后公告与关于页入口不带 */
  updateAction: boolean;
  /** notes 从新到旧排列 */
  show: (notes: ReleaseNote[], options?: { updateAction?: boolean }) => void;
  close: () => void;
}

/** 公告弹层的全局开合状态：通知按钮与关于页都经此打开，弹层由 AutoUpdateChecker 挂载 */
export const useReleaseNotesStore = create<ReleaseNotesState>()(set => ({
  open: false,
  notes: [],
  updateAction: false,
  show: (notes, options) =>
    set({
      open: true,
      notes,
      updateAction: Boolean(options?.updateAction),
    }),
  close: () => set({ open: false, updateAction: false }),
}));
