import React, { useEffect, useMemo } from "react";
import {
  pausePomodoroSession,
  resumePomodoroSession,
  stopPomodoroSession,
} from "@/commands";
import { hidePomodoroImmersiveWindow } from "@/commands/window";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useInitDatabase from "@/hooks/useInitDatabase";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { fmt, FIVE_MINUTES_MS } from "./utils";
import { App } from "antd";
import { motion } from "motion/react";
import FlipClock from "./components/FlipClock";
import BackgroundSoundPanel from "./components/BackgroundSoundPanel";
import { HiMusicNote } from "react-icons/hi";
import { AiOutlineClose } from "react-icons/ai";
import { FiPause, FiSquare, FiPlay } from "react-icons/fi";

const SIXTY_MIN_MS = 60 * 60 * 1000;
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const Immersive: React.FC = () => {
  useInitDatabase();
  const isConnected = useDatabaseConnected();
  const { modal } = App.useApp();
  const {
    activeSession,
    elapsedMs,
    remainMs,
    initPomodoro,
    inited,
    initStatus,
    syncActiveSession,
  } = usePomodoroStore();
  const { client, isSocketOpen, isServerReady } = useBackendWebsocketStore();

  useEffect(() => {
    if (!isConnected || !isSocketOpen || !isServerReady) {
      return;
    }

    if (!inited) {
      initPomodoro();
      return;
    }

    syncActiveSession().catch((error) => {
      console.error("Failed to sync pomodoro immersive session:", error);
    });
  }, [
    initPomodoro,
    inited,
    isConnected,
    isServerReady,
    isSocketOpen,
    syncActiveSession,
  ]);

  useEffect(() => {
    if (document.visibilityState === "visible" && inited) {
      syncActiveSession().catch((error) => {
        console.error(
          "Failed to resync immersive session on visibility:",
          error,
        );
      });
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && inited) {
        syncActiveSession().catch((error) => {
          console.error(
            "Failed to resync immersive session on visibility:",
            error,
          );
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [inited, syncActiveSession]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hidePomodoroImmersiveWindow();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!client) return;

    const handler = (session: unknown) => {
      if (!session) {
        hidePomodoroImmersiveWindow();
      }
    };

    client.registerNotificationHandler(
      "pomodoro:active-session-changed",
      handler,
    );

    return () => {
      client.unregisterNotificationHandler(
        "pomodoro:active-session-changed",
        handler,
      );
    };
  }, [client]);

  const progress = useMemo(() => {
    if (!activeSession) return 0;
    if (
      activeSession.expectedMs !== undefined &&
      activeSession.expectedMs > 0
    ) {
      const elapsed = activeSession.expectedMs - Math.max(remainMs ?? 0, 0);
      return Math.min(
        Math.max((elapsed / activeSession.expectedMs) * 100, 0),
        100,
      );
    }
    return Math.min((elapsedMs / SIXTY_MIN_MS) * 100, 100);
  }, [activeSession, remainMs, elapsedMs]);

  const isRunning = activeSession?.status === "running";

  if (initStatus === "loading" || (isConnected && !inited)) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-black">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-white/30 text-sm tracking-widest uppercase"
        >
          正在同步...
        </motion.div>
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-black">
        <div className="text-white/20 text-sm tracking-widest uppercase">
          当前没有进行中的专注
        </div>
      </div>
    );
  }

  const handleStop = async () => {
    if (elapsedMs < FIVE_MINUTES_MS) {
      modal.confirm({
        title: "专注时长不足 5 分钟",
        content: "当前专注时长不足 5 分钟，是否放弃本次记录？",
        okText: "放弃",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: async () => {
          await stopPomodoroSession(true);
          hidePomodoroImmersiveWindow();
        },
      });
    } else {
      await stopPomodoroSession(true);
      hidePomodoroImmersiveWindow();
    }
  };

  const timeDisplay =
    activeSession.expectedMs !== undefined
      ? fmt(remainMs ?? 0)
      : fmt(elapsedMs);

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center relative select-none bg-black">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      >
        <FlipClock time={timeDisplay} />
      </motion.div>

      {activeSession.expectedMs !== undefined && (
        <motion.div
          className="mt-10 rounded-full overflow-hidden"
          style={{
            width: 640,
            height: 2,
            background: "rgba(255, 255, 255, 0.04)",
          }}
          initial={{ opacity: 0, scaleX: 0.8 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT_EXPO }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              backgroundColor: "rgba(255, 255, 255, 0.25)",
              transition: "width 1s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </motion.div>
      )}

      <motion.div
        className="flex items-center gap-6 mt-12"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: EASE_OUT_EXPO }}
      >
        {isRunning ? (
          <button
            className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 bg-white/[0.06] hover:bg-white/[0.12] text-white/40 hover:text-white/70"
            onClick={() => pausePomodoroSession()}
            title="暂停"
          >
            <FiPause className="text-lg" />
          </button>
        ) : (
          <button
            className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 bg-white/[0.06] hover:bg-white/[0.12] text-white/40 hover:text-white/70"
            onClick={() => resumePomodoroSession()}
            title="继续"
          >
            <FiPlay className="text-lg" />
          </button>
        )}
        <button
          className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 bg-white/[0.06] hover:bg-white/[0.12] text-white/40 hover:text-white/70"
          onClick={handleStop}
          title="结束"
        >
          <FiSquare className="text-base" />
        </button>
      </motion.div>

      <BackgroundSoundPanel>
        <button
          className="absolute bottom-6 right-20 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 text-white/15 hover:text-white/40"
          title="背景音"
        >
          <HiMusicNote className="text-lg" />
        </button>
      </BackgroundSoundPanel>

      <button
        className="absolute bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 text-white/15 hover:text-white/40"
        onClick={() => hidePomodoroImmersiveWindow()}
        title="退出沉浸模式 (Esc)"
      >
        <AiOutlineClose className="text-lg" />
      </button>
    </div>
  );
};

export default Immersive;
