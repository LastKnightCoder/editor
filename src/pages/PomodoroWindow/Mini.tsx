import React, { useEffect } from "react";
import {
  pausePomodoroSession,
  resumePomodoroSession,
  stopPomodoroSession,
} from "@/commands";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import useInitDatabase from "@/hooks/useInitDatabase";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { fmt } from "./utils";

const Mini: React.FC = () => {
  useInitDatabase();
  const isConnected = useDatabaseConnected();
  const { activeSession, elapsedMs, remainMs, initPomodoro, inited } =
    usePomodoroStore();

  useEffect(() => {
    if (isConnected) {
      if (!inited) {
        initPomodoro();
      }
    }
  }, [initPomodoro, inited, isConnected]);

  if (!activeSession)
    return <div className="p-3 text-sm text-gray-600">未在计时</div>;

  return (
    <div className="p-3 flex items-center gap-2">
      <div className="font-semibold">
        {activeSession.expectedMs !== undefined
          ? fmt(remainMs ?? 0)
          : fmt(elapsedMs)}
      </div>
      {activeSession.status === "running" ? (
        <button
          className="px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-400 text-xs"
          onClick={() => pausePomodoroSession()}
        >
          暂停
        </button>
      ) : (
        <button
          className="px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-500 text-xs"
          onClick={() => resumePomodoroSession()}
        >
          继续
        </button>
      )}
      <button
        className="px-2 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-500 text-xs"
        onClick={() => stopPomodoroSession(true)}
      >
        结束
      </button>
    </div>
  );
};

export default Mini;
