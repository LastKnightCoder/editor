import { create } from "zustand";
import { produce } from "immer";
import { persist } from "zustand/middleware";
import { PomodoroPreset, PomodoroSession } from "@/types";
import { useBackendWebsocketStore } from "./useBackendWebsocketStore";
import {
  getActivePomodoroSession,
  listPomodoroSessions,
  listPomodoroPresets,
  setBackgroundSound as setBackgroundSoundCommand,
  summaryPomodoroToday,
  summaryPomodoroTotal,
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

const SESSION_PAGE_SIZE = 100;
export type PomodoroInitStatus = "idle" | "loading" | "ready" | "error";

interface PomodoroState {
  inited: boolean;
  initStatus: PomodoroInitStatus;
  handlersBound: boolean;
  presets: PomodoroPreset[];
  sessions: PomodoroSession[]; // 当前已加载的专注记录
  hasMoreSessions: boolean;
  loadingMoreSessions: boolean;
  selectedPreset: PomodoroPreset | null;
  activeSession: PomodoroSession | null;
  elapsedMs: number; // 当前已专注时长
  remainMs?: number; // 当前剩余时长（倒计时）
  rightSidebarWidth: number; // 右侧边栏宽度
  backgroundSound: BackgroundSoundType; // 背景音类型
  backgroundVolume: number; // 背景音音量 0-100
  today: { count: number; focusMs: number }; // 今日统计
  total: { count: number; focusMs: number }; // 总统计
}

interface PomodoroActions {
  initPomodoro: () => Promise<void>;
  syncActiveSession: () => Promise<void>;
  setPresets: (presets: PomodoroPreset[]) => void;
  setSessions: (sessions: PomodoroSession[]) => void;
  setSelectedPreset: (preset: PomodoroPreset | null) => void;
  setActiveSession: (s: PomodoroSession | null) => void;
  updateTick: (data: {
    session: PomodoroSession;
    elapsedMs: number;
    remainMs?: number;
  }) => void;
  loadMoreSessions: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  refreshPresets: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  setBackgroundSound: (sound: BackgroundSoundType) => Promise<void>;
  setBackgroundVolume: (volume: number) => Promise<void>;
}

const initialState: PomodoroState = {
  inited: false,
  initStatus: "idle",
  handlersBound: false,
  presets: [],
  sessions: [],
  hasMoreSessions: false,
  loadingMoreSessions: false,
  selectedPreset: null,
  activeSession: null,
  elapsedMs: 0,
  remainMs: undefined,
  rightSidebarWidth: 350,
  backgroundSound: null,
  backgroundVolume: 50,
  today: { count: 0, focusMs: 0 },
  total: { count: 0, focusMs: 0 },
};

const getSessionTiming = (session: PomodoroSession | null) => {
  if (!session) {
    return {
      elapsedMs: 0,
      remainMs: undefined as number | undefined,
    };
  }

  const now = Date.now();
  let pauseTotalMs = session.pauseTotalMs;

  if (session.status === "paused") {
    const lastPause = session.pauses[session.pauses.length - 1];
    if (lastPause && lastPause.end === undefined) {
      pauseTotalMs += now - lastPause.start;
    }
  }

  const elapsedMs = Math.max(0, now - session.startTime - pauseTotalMs);
  const remainMs =
    session.expectedMs !== undefined
      ? Math.max(0, session.expectedMs - elapsedMs)
      : undefined;

  return { elapsedMs, remainMs };
};

const applyActiveSessionState = (
  draft: Pick<PomodoroState, "activeSession" | "elapsedMs" | "remainMs">,
  session: PomodoroSession | null,
) => {
  const timing = getSessionTiming(session);
  draft.activeSession = session;
  draft.elapsedMs = timing.elapsedMs;
  draft.remainMs = timing.remainMs;
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

        if (!get().handlersBound) {
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

              if (prevSession && !newSession) {
                get().refreshSessions();
                get().refreshSummary();
              }

              set(
                produce((draft: PomodoroState) => {
                  applyActiveSessionState(draft, newSession);
                }),
              );
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

          set(
            produce((draft: PomodoroState) => {
              draft.handlersBound = true;
            }),
          );
        }

        // 获取初始数据
        try {
          set(
            produce((draft: PomodoroState) => {
              draft.initStatus = "loading";
            }),
          );
          const [selectedPreset, activeSession, presets, sessions] =
            await Promise.all([
              client.sendRequest(
                "pomodoro:get-selected-preset",
                null,
              ) as Promise<PomodoroPreset | null>,
              getActivePomodoroSession(),
              listPomodoroPresets(),
              listPomodoroSessions({ limit: SESSION_PAGE_SIZE }),
            ]);

          set(
            produce((draft: PomodoroState) => {
              draft.selectedPreset = selectedPreset;
              draft.presets = presets;
              draft.sessions = sessions;
              draft.hasMoreSessions = sessions.length >= SESSION_PAGE_SIZE;
              draft.loadingMoreSessions = false;
              draft.inited = true;
              draft.initStatus = "ready";
              applyActiveSessionState(draft, activeSession);
            }),
          );

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

          // 获取统计数据
          await get().refreshSummary();
        } catch (e) {
          set(
            produce((draft: PomodoroState) => {
              draft.initStatus = "error";
            }),
          );
          console.error("initPomodoro error", e);
        }
      },

      syncActiveSession: async () => {
        const activeSession = await getActivePomodoroSession();
        set(
          produce((draft: PomodoroState) => {
            applyActiveSessionState(draft, activeSession);
          }),
        );
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
            applyActiveSessionState(draft, session);
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

      loadMoreSessions: async () => {
        const { loadingMoreSessions, hasMoreSessions, sessions } = get();
        if (loadingMoreSessions || !hasMoreSessions) {
          return;
        }

        set(
          produce((draft: PomodoroState) => {
            draft.loadingMoreSessions = true;
          }),
        );

        try {
          const nextSessions = await listPomodoroSessions({
            limit: SESSION_PAGE_SIZE,
            offset: sessions.length,
          });
          const existingIds = new Set(sessions.map((session) => session.id));
          const mergedSessions = [
            ...sessions,
            ...nextSessions.filter((session) => !existingIds.has(session.id)),
          ];

          set(
            produce((draft: PomodoroState) => {
              draft.sessions = mergedSessions;
              draft.hasMoreSessions = nextSessions.length >= SESSION_PAGE_SIZE;
              draft.loadingMoreSessions = false;
            }),
          );
        } catch (error) {
          set(
            produce((draft: PomodoroState) => {
              draft.loadingMoreSessions = false;
            }),
          );
          throw error;
        }
      },

      refreshSessions: async () => {
        const loadedCount = Math.max(get().sessions.length, SESSION_PAGE_SIZE);
        const sessions = await listPomodoroSessions({
          limit: loadedCount,
        });
        set(
          produce((draft: PomodoroState) => {
            draft.sessions = sessions;
            draft.hasMoreSessions = sessions.length >= loadedCount;
          }),
        );
      },

      refreshPresets: async () => {
        const presets = await listPomodoroPresets();
        get().setPresets(presets);
      },

      refreshSummary: async () => {
        const today = await summaryPomodoroToday();
        const total = await summaryPomodoroTotal();
        set(
          produce((draft: PomodoroState) => {
            draft.today = today;
            draft.total = total;
          }),
        );
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
