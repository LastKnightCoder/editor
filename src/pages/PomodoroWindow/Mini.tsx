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
    <div className="flex flex-col items-center w-full max-w-4xl gap-10">
      <div className="bg-gradient-to-br from-white to-gray-200 rounded-full w-[60vmin] h-[60vmin] flex justify-center items-center shadow-2xl transition-transform duration-300 hover:scale-105">
        <div className="text-center text-gray-800 p-5">
          {activeSession.expectedMs !== undefined
            ? fmt(remainMs ?? 0)
            : fmt(elapsedMs)}
        </div>
      </div>

      <div className="flex gap-4 md:gap-8 flex-wrap justify-center">
        {activeSession.status === "running" ? (
          <button
            className="bg-gradient-to-br from-orange-400 to-orange-300 rounded-full 
                      w-12 h-12 md:w-32 md:h-32 
                      text-white text-xs md:text-lg 
                      font-bold cursor-pointer shadow-lg transition-all duration-300 
                      flex justify-center items-center text-center p-1 md:p-4 
                      hover:-translate-y-1 hover:shadow-xl active:scale-95"
            onClick={() => pausePomodoroSession()}
          >
            暂停
          </button>
        ) : (
          <button
            className="bg-gradient-to-br from-orange-400 to-orange-300 rounded-full 
                      w-12 h-12 md:w-32 md:h-32 
                      text-white text-xs md:text-lg 
                      font-bold cursor-pointer shadow-lg transition-all duration-300 
                      flex justify-center items-center text-center p-1 md:p-4 
                      hover:-translate-y-1 hover:shadow-xl active:scale-95"
            onClick={() => resumePomodoroSession()}
          >
            继续
          </button>
        )}
        <button
          className="bg-gradient-to-br from-green-400 to-teal-400 rounded-full 
                      w-12 h-12 md:w-32 md:h-32
                      text-white text-xs md:text-lg
                      font-bold cursor-pointer shadow-lg transition-all duration-300 
                      flex justify-center items-center text-center p-1 md:p-4
                      hover:-translate-y-1 hover:shadow-xl active:scale-95"
          onClick={() => stopPomodoroSession(true)}
        >
          结束
        </button>
      </div>
    </div>
  );
};

export default Mini;
