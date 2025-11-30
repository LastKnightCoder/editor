import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SettingsTabKey =
  | "app"
  | "appearance"
  | "imageBed"
  | "sync"
  | "llm"
  | "embedding"
  | "textToSpeech"
  | "module"
  | "customBlock"
  | "integration"
  | "misc";

interface SettingTabState {
  activeKey: SettingsTabKey;
  setActiveKey: (key: SettingsTabKey) => void;
}

const useSettingTabStore = create<SettingTabState>()(
  persist(
    (set) => ({
      activeKey: "app",
      setActiveKey: (activeKey) => set({ activeKey }),
    }),
    {
      name: "settings-tab",
      partialize: (state) => ({
        activeKey: state.activeKey,
      }),
    },
  ),
);

export default useSettingTabStore;
