/**
 * 设置弹窗开闭态（壳层浮层，D-028）。
 *
 * open 属壳层 UI 状态（Sidebar 底部入口 / 命令面板 / Ctrl+, 多入口触发），
 * 故归 app 层——features 域之间禁止互引 store，features/settings 只消费本 store。
 * section（当前子页）持久化：重开设置回到上次所在分区。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SettingsSectionKey } from "@/features/settings/sections";

export type SettingsLocation = SettingsSectionKey;

interface SettingsUiStore {
  llmTab: "providers" | "assignment" | "permission" | "usage";
  usagePluginId: string;
  openAIUsage: (pluginId?: string) => void;
  open: boolean;
  section: SettingsLocation;
  openSettings: (section?: SettingsLocation) => void;
  closeSettings: () => void;
  setSection: (section: SettingsLocation) => void;
}

export const useSettingsStore = create<SettingsUiStore>()(
  persist(
    set => ({
      open: false,
      llmTab: "providers",
      usagePluginId: "",
      openAIUsage: (pluginId = "") =>
        set({ open: true, section: "llm", llmTab: "usage", usagePluginId: pluginId }),
      section: "appearance",
      openSettings: section => set({ open: true, ...(section ? { section } : {}) }),
      closeSettings: () => set({ open: false }),
      setSection: section => set({ section }),
    }),
    {
      name: "tau-settings-ui",
      partialize: s => ({ section: s.section }),
    }
  )
);
