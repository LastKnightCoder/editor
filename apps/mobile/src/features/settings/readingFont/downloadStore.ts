// 字体下载状态放模块级 store：关掉设置面板后下载继续，回来仍能看到进度。
// 同一时间只下载一款（Rust 侧同样只允许一个下载）。

import { create } from "zustand";
import {
  cancelReadingFontDownload,
  downloadReadingFont,
  isReadingFontCancelled,
  readingFontErrorMessage,
  type ReadingFontProgress,
  type ReadingFontRelease,
} from "./api";

type ReadingFontDownloadState = {
  downloadingId: string | null;
  progress: ReadingFontProgress | null;
  /** 最近一次失败的字体与提示，下次下载或取消时清空 */
  error: { id: string; message: string } | null;
  download: (id: string, onInstalled: (font: ReadingFontRelease) => void) => Promise<void>;
  cancel: () => Promise<void>;
};

export const useReadingFontDownload = create<ReadingFontDownloadState>((set, get) => ({
  downloadingId: null,
  progress: null,
  error: null,

  async download(id, onInstalled) {
    if (get().downloadingId) return;
    set({ downloadingId: id, progress: null, error: null });
    try {
      const font = await downloadReadingFont(id, progress => set({ progress }));
      set({ downloadingId: null, progress: null });
      onInstalled(font);
    } catch (error) {
      set({
        downloadingId: null,
        progress: null,
        error: isReadingFontCancelled(error)
          ? null
          : { id, message: readingFontErrorMessage(error) },
      });
    }
  },

  async cancel() {
    if (!get().downloadingId) return;
    await cancelReadingFontDownload();
  },
}));
