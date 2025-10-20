import { create } from "zustand";
import { produce } from "immer";
import { persist } from "zustand/middleware";
import { PomodoroPreset, PomodoroSession } from "@/types";
import { useBackendWebsocketStore } from "./useBackendWebsocketStore";

interface PomodoroState {
  inited: boolean;
  presets: PomodoroPreset[];
  selectedPreset: PomodoroPreset | null;
  activeSession: PomodoroSession | null;
  elapsedMs: number; // 当前已专注时长
  remainMs?: number; // 当前剩余时长（倒计时）
  rightSidebarWidth: number; // 右侧边栏宽度
}

interface PomodoroActions {
  initPomodoro: () => Promise<void>;
  setPresets: (presets: PomodoroPreset[]) => void;
  setSelectedPreset: (preset: PomodoroPreset | null) => void;
  setActiveSession: (s: PomodoroSession | null) => void;
  updateTick: (data: {
    session: PomodoroSession;
    elapsedMs: number;
    remainMs?: number;
  }) => void;
}

const initialState: PomodoroState = {
  inited: false,
  presets: [],
  selectedPreset: null,
  activeSession: null,
  elapsedMs: 0,
  remainMs: undefined,
  rightSidebarWidth: 350,
};

export const usePomodoroStore = create<PomodoroState & PomodoroActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      initPomodoro: async () => {
        const client = useBackendWebsocketStore.getState().client;
        if (!client) {
          throw new Error("Client not initialized");
        }

        // 注册 notification handlers
        client.registerNotificationHandler(
          "pomodoro:selected-preset-changed",
          (preset) => {
            get().setSelectedPreset(preset as PomodoroPreset | null);
          },
        );

        client.registerNotificationHandler(
          "pomodoro:active-session-changed",
          (session) => {
            get().setActiveSession(session as PomodoroSession | null);
          },
        );

        client.registerNotificationHandler("pomodoro:tick", (data) => {
          const tickState = data as {
            session: PomodoroSession;
            elapsedMs: number;
            remainMs?: number;
          };
          get().updateTick(tickState);
        });

        // 获取初始数据
        try {
          const selectedPreset = (await client.sendRequest(
            "pomodoro:get-selected-preset",
            null,
          )) as PomodoroPreset | null;

          // 启动时不会有 active session（软件关闭时会话数据丢失）
          set({
            selectedPreset,
            activeSession: null,
            elapsedMs: 0,
            remainMs: undefined,
            inited: true,
          });
        } catch (e) {
          console.error("initPomodoro error", e);
        }
      },

      setPresets: (presets) =>
        set(
          produce((draft: PomodoroState) => {
            draft.presets = presets;
          }),
        ),

      setSelectedPreset: (preset) =>
        set(
          produce((draft: PomodoroState) => {
            draft.selectedPreset = preset;
          }),
        ),

      setActiveSession: (session) =>
        set(
          produce((draft: PomodoroState) => {
            draft.activeSession = session;
          }),
        ),

      updateTick: (data) =>
        set(
          produce((draft: PomodoroState) => {
            draft.activeSession = data.session;
            draft.elapsedMs = data.elapsedMs;
            draft.remainMs = data.remainMs;
          }),
        ),
    }),
    {
      name: "pomodoro-storage",
      partialize: (state) => ({
        rightSidebarWidth: state.rightSidebarWidth,
      }),
    },
  ),
);
