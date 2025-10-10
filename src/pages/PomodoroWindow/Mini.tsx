import React, { useEffect, useMemo, useState } from "react";
import {
  getActivePomodoroSession,
  pausePomodoroSession,
  resumePomodoroSession,
  stopPomodoroSession,
} from "@/commands";
import { on, off } from "@/electron";
import { useMemoizedFn } from "ahooks";

const Mini: React.FC = () => {
  const [active, setActive] =
    useState<Awaited<ReturnType<typeof getActivePomodoroSession>>>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = useMemoizedFn(async () => {
    setActive(await getActivePomodoroSession());
  });

  useEffect(() => {
    refresh();
    const h = () => refresh();
    on && on("pomodoro:state-changed", h);
    // 订阅tick以秒级刷新
    on && on("pomodoro:tick", h);
    return () => {
      off && off("pomodoro:state-changed", h);
      off && off("pomodoro:tick", h);
    };
  }, [refresh]);

  const elapsed = useMemo(() => {
    if (!active) return 0;
    let pause = active.pauseTotalMs;
    if (active.status === "paused") {
      const last = active.pauses[active.pauses.length - 1];
      if (last && last.end === undefined) {
        pause += now - last.start;
      }
    }
    return Math.max(0, (active.endTime ?? now) - active.startTime - pause);
  }, [active, now]);

  const remainMs = useMemo(() => {
    if (!active || !active.expectedMs) return undefined;
    return Math.max(0, active.expectedMs - elapsed);
  }, [active, elapsed]);

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    const mm = Math.floor(m % 60);
    const hh = Math.floor(m / 60);
    return (
      (hh > 0 ? `${hh}:` : "") +
      `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
    );
  };

  if (!active) return <div className="p-3 text-sm text-gray-600">未在计时</div>;

  return (
    <div className="p-3 flex items-center gap-2">
      <div className="font-semibold">
        {active.expectedMs ? fmt(remainMs || 0) : fmt(elapsed)}
      </div>
      {active.status === "running" ? (
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
