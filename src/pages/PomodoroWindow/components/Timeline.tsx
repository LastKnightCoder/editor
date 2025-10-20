import { useMemo } from "react";
import { PomodoroSession } from "@/types";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import stopwatchIcon from "@/assets/icons/stopwatch.svg";

const formatDate = (timestamp: number) => {
  const d = new Date(timestamp);
  const currentYear = new Date().getFullYear();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const date = d.getDate();

  if (year === currentYear) {
    return `${month}月${date}日`;
  } else {
    return `${year}年${month}月${date}日`;
  }
};

const groupByDate = (sessions: PomodoroSession[]) => {
  const map = new Map<string, PomodoroSession[]>();
  sessions.forEach((s) => {
    const d = new Date(s.startTime);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const arr = map.get(key) || [];
    arr.push(s);
    map.set(key, arr);
  });
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
};

const Timeline = () => {
  const sessions = usePomodoroStore((state) => state.sessions);
  const presets = usePomodoroStore((state) => state.presets);

  const groups = useMemo(() => groupByDate(sessions), [sessions]);

  const presetMap = useMemo(() => {
    const map = new Map<number, string>();
    presets.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [presets]);

  return (
    <div className="mt-6 h-full flex flex-col overflow-hidden">
      <div className="mb-4 flex-shrink-0">
        <div className="text-sm text-gray-500 dark:text-gray-400">专注记录</div>
      </div>

      <div className="space-y-6 overflow-y-auto scrollbar-hide flex-1">
        {groups.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            暂无记录
          </div>
        )}
        {groups.map(([dateKey, list]) => {
          const firstSession = list[0];
          const displayDate = formatDate(firstSession.startTime);

          return (
            <div key={dateKey}>
              <div className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                {displayDate}
              </div>
              <div>
                {list.map((session, index) => {
                  const isLast = index === list.length - 1;
                  const startTime = new Date(
                    session.startTime,
                  ).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const endTime = session.endTime
                    ? new Date(session.endTime).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : null;
                  const presetName =
                    presetMap.get(session.presetId) || "未知预设";
                  const focusMinutes = Math.round(
                    (session.focusMs || 0) / 60000,
                  );

                  return (
                    <div
                      key={session.id}
                      className="flex items-start gap-3 relative"
                    >
                      {/* 连接线 - 相对于整个条目定位，延伸到下一个条目 */}
                      {!isLast && (
                        <div
                          className="absolute w-[2px] bg-blue-500/20 dark:bg-blue-400/20 z-0"
                          style={{
                            left: "calc(1rem - 1px)",
                            top: "2.25rem",
                            bottom: "0.25rem",
                          }}
                        />
                      )}
                      {isLast && (
                        <div
                          className="absolute w-[2px] bg-blue-500/20 dark:bg-blue-400/20 z-0"
                          style={{
                            left: "calc(1rem - 1px)",
                            top: "2.25rem",
                            height: "0.75rem",
                          }}
                        />
                      )}

                      {/* 左侧：图标和圆圈 */}
                      <div className="flex flex-col items-center relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                          <img
                            src={stopwatchIcon}
                            alt="stopwatch"
                            className="w-5 h-5"
                            style={{
                              filter:
                                "invert(45%) sepia(91%) saturate(1794%) hue-rotate(201deg) brightness(97%) contrast(92%)",
                            }}
                          />
                        </div>
                        <div className="w-2 h-2 border border-blue-500 dark:border-blue-400 rounded-full bg-white dark:bg-gray-800 mt-3 relative z-10" />
                      </div>

                      {/* 中间和右侧：内容 */}
                      <div className="flex-1 pb-8">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {startTime} - {endTime || "进行中"}
                            </div>
                            <div className="text-base mt-1 dark:text-gray-200">
                              {presetName}
                            </div>
                          </div>

                          {/* 右侧：时长 */}
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {focusMinutes}m
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Timeline;
