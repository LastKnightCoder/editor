import React, { useEffect } from "react";
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
import { AiOutlineClose } from "react-icons/ai";
import { App } from "antd";

const Immersive: React.FC = () => {
  useInitDatabase();
  const isConnected = useDatabaseConnected();
  const { modal } = App.useApp();
  const { activeSession, elapsedMs, remainMs, initPomodoro, inited } =
    usePomodoroStore();
  const { client } = useBackendWebsocketStore();

  useEffect(() => {
    if (isConnected) {
      if (!inited) {
        initPomodoro();
      }
    }
  }, [initPomodoro, inited, isConnected]);

  // 监听 Esc 键隐藏窗口
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

  // 监听番茄钟结束，自动关闭窗口
  useEffect(() => {
    if (!client) return;

    const handler = (session: unknown) => {
      // 当 activeSession 从有变为 null 时，说明番茄钟结束
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

  if (!activeSession) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">当前没有正在进行的番茄钟</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black flex flex-col items-center justify-center relative">
      {/* 主要内容区 */}
      <div className="flex flex-col items-center gap-8">
        {/* 倒计时/正计时显示 */}
        <div className="text-white text-[120px] font-light tracking-wider">
          {activeSession.expectedMs !== undefined
            ? fmt(remainMs ?? 0)
            : fmt(elapsedMs)}
        </div>

        {/* 状态文字 */}
        <div className="text-white/60 text-2xl tracking-widest">
          {activeSession.status === "running" ? "专注中" : "已暂停"}
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center gap-6 mt-4">
          {activeSession.status === "running" ? (
            <button
              className="px-8 py-3 rounded-full bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-lg border border-amber-500/30 transition-all"
              onClick={() => pausePomodoroSession()}
            >
              暂停
            </button>
          ) : (
            <button
              className="px-8 py-3 rounded-full bg-green-600/20 text-green-400 hover:bg-green-600/30 text-lg border border-green-600/30 transition-all"
              onClick={() => resumePomodoroSession()}
            >
              继续
            </button>
          )}
          <button
            className="px-8 py-3 rounded-full bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 text-lg border border-rose-600/30 transition-all"
            onClick={async () => {
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
            }}
          >
            结束
          </button>
        </div>
      </div>

      {/* 右下角退出按钮 */}
      <button
        className="absolute bottom-8 right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all"
        onClick={() => hidePomodoroImmersiveWindow()}
        title="退出沉浸模式 (Esc)"
      >
        <AiOutlineClose className="text-2xl" />
      </button>
    </div>
  );
};

export default Immersive;
