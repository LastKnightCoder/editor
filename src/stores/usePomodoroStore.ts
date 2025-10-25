import { create } from "zustand";
import { produce } from "immer";
import { persist } from "zustand/middleware";
import { PomodoroPreset, PomodoroSession } from "@/types";
import { useBackendWebsocketStore } from "./useBackendWebsocketStore";
import {
  listPomodoroSessions,
  listPomodoroPresets,
  setBackgroundSound as setBackgroundSoundCommand,
} from "@/commands";

export type BackgroundSoundType =
  | null
  | "brook"
  | "birds"
  | "autumn"
  | "tide"
  | "summer"
  | "wind-chime"
  | "bonfire"
  | "rain";

interface PomodoroState {
  inited: boolean;
  presets: PomodoroPreset[];
  sessions: PomodoroSession[]; // 专注记录（近30天）
  selectedPreset: PomodoroPreset | null;
  activeSession: PomodoroSession | null;
  elapsedMs: number; // 当前已专注时长
  remainMs?: number; // 当前剩余时长（倒计时）
  rightSidebarWidth: number; // 右侧边栏宽度
  backgroundSound: BackgroundSoundType; // 背景音类型
  backgroundVolume: number; // 背景音音量 0-100
}

interface PomodoroActions {
  initPomodoro: () => Promise<void>;
  setPresets: (presets: PomodoroPreset[]) => void;
  setSessions: (sessions: PomodoroSession[]) => void;
  setSelectedPreset: (preset: PomodoroPreset | null) => void;
  setActiveSession: (s: PomodoroSession | null) => void;
  updateTick: (data: {
    session: PomodoroSession;
    elapsedMs: number;
    remainMs?: number;
  }) => void;
  refreshSessions: () => Promise<void>;
  refreshPresets: () => Promise<void>;
  setBackgroundSound: (sound: BackgroundSoundType) => Promise<void>;
  setBackgroundVolume: (volume: number) => Promise<void>;
}

const initialState: PomodoroState = {
  inited: false,
  presets: [],
  sessions: [],
  selectedPreset: null,
  activeSession: null,
  elapsedMs: 0,
  remainMs: undefined,
  rightSidebarWidth: 350,
  backgroundSound: null,
  backgroundVolume: 50,
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
            const prevSession = get().activeSession;
            const newSession = session as PomodoroSession | null;

            // 检测会话结束：之前有会话，现在变为 null
            if (prevSession && !newSession) {
              // 会话结束，刷新专注列表
              get().refreshSessions();
            }

            get().setActiveSession(newSession);
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

        client.registerNotificationHandler(
          "pomodoro:background-sound-changed",
          (data) => {
            const soundData = data as {
              backgroundSound: BackgroundSoundType;
              backgroundVolume: number;
            };
            set(
              produce((draft: PomodoroState) => {
                draft.backgroundSound = soundData.backgroundSound;
                draft.backgroundVolume = soundData.backgroundVolume;
              }),
            );
          },
        );

        // 获取初始数据
        try {
          const selectedPreset = (await client.sendRequest(
            "pomodoro:get-selected-preset",
            null,
          )) as PomodoroPreset | null;

          // 获取预设列表
          const presets = await listPomodoroPresets();

          // 获取专注记录（近30天）
          const end = Date.now();
          const start = end - 30 * 24 * 60 * 60 * 1000;
          const sessions = await listPomodoroSessions({
            start,
            end,
            limit: 1000,
          });

          // 启动时不会有 active session（软件关闭时会话数据丢失）
          set({
            selectedPreset,
            presets,
            sessions,
            activeSession: null,
            elapsedMs: 0,
            remainMs: undefined,
            inited: true,
          });

          // 同步本地持久化的背景音设置到服务端
          const currentState = get();
          if (
            currentState.backgroundSound !== null ||
            currentState.backgroundVolume !== 50
          ) {
            await setBackgroundSoundCommand({
              backgroundSound: currentState.backgroundSound,
              backgroundVolume: currentState.backgroundVolume,
            }).catch((err) => {
              console.error("Failed to sync background sound to server:", err);
            });
          }
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

      setSessions: (sessions) =>
        set(
          produce((draft: PomodoroState) => {
            draft.sessions = sessions;
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

      refreshSessions: async () => {
        const end = Date.now();
        const start = end - 30 * 24 * 60 * 60 * 1000;
        const sessions = await listPomodoroSessions({
          start,
          end,
          limit: 1000,
        });
        get().setSessions(sessions);
      },

      refreshPresets: async () => {
        const presets = await listPomodoroPresets();
        get().setPresets(presets);
      },

      setBackgroundSound: async (sound) => {
        await setBackgroundSoundCommand({ backgroundSound: sound });
      },

      setBackgroundVolume: async (volume) => {
        await setBackgroundSoundCommand({ backgroundVolume: volume });
      },
    }),
    {
      name: "pomodoro-storage",
      partialize: (state) => ({
        rightSidebarWidth: state.rightSidebarWidth,
        backgroundSound: state.backgroundSound,
        backgroundVolume: state.backgroundVolume,
      }),
    },
  ),
);
