/** PDF 阅读器本机偏好：左面板、划线默认色与样式、夜间页面、对话栏开合与宽度（所有 PDF 共用） */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EHighlightColor } from "@/types";

export type LeftTab = "toc" | "thumbs" | "anns" | "marks";
export type NewMarkupStyle = "highlight" | "underline";

export const CHAT_MIN_W = 320;
export const CHAT_MAX_W = 560;
export const CHAT_DEFAULT_W = 380;

interface ReaderPrefs {
  leftOpen: boolean;
  leftTab: LeftTab;
  lastColor: EHighlightColor;
  lastStyle: NewMarkupStyle;
  nightPage: boolean;
  chatOpen: boolean;
  chatWidth: number;
  setLeftOpen: (open: boolean) => void;
  toggleLeft: () => void;
  setLeftTab: (tab: LeftTab) => void;
  setLastColor: (color: EHighlightColor) => void;
  setLastStyle: (style: NewMarkupStyle) => void;
  toggleNightPage: () => void;
  setChatOpen: (open: boolean) => void;
  setChatWidth: (width: number) => void;
}

export const useReaderPrefs = create<ReaderPrefs>()(
  persist(
    set => ({
      leftOpen: true,
      leftTab: "toc",
      lastColor: EHighlightColor.Yellow,
      lastStyle: "highlight",
      nightPage: false,
      chatOpen: true,
      chatWidth: CHAT_DEFAULT_W,
      setLeftOpen: leftOpen => set({ leftOpen }),
      toggleLeft: () => set(s => ({ leftOpen: !s.leftOpen })),
      setLeftTab: leftTab => set({ leftTab, leftOpen: true }),
      setLastColor: lastColor => set({ lastColor }),
      setLastStyle: lastStyle => set({ lastStyle }),
      toggleNightPage: () => set(s => ({ nightPage: !s.nightPage })),
      setChatOpen: chatOpen => set({ chatOpen }),
      setChatWidth: w =>
        set({ chatWidth: Math.min(CHAT_MAX_W, Math.max(CHAT_MIN_W, Math.round(w))) }),
    }),
    {
      name: "tau-pdf-reader-prefs",
      partialize: ({
        leftOpen,
        leftTab,
        lastColor,
        lastStyle,
        nightPage,
        chatOpen,
        chatWidth,
      }) => ({
        leftOpen,
        leftTab,
        lastColor,
        lastStyle,
        nightPage,
        chatOpen,
        chatWidth,
      }),
    }
  )
);
