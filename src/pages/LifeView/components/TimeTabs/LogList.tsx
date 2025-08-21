import { memo, useEffect, useMemo, useState } from "react";
import { message } from "antd";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import { getLogsByRange, LogEntry, deleteLog } from "@/commands/log";
import LogCard from "./LogCard";

const LogList = memo(() => {
  const { periodType, anchorDate, setActiveLogId, activeLogId } =
    useLifeViewStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const range = useMemo(() => {
    if (periodType === "day") {
      const s = anchorDate.startOf("day");
      return {
        start: s.valueOf(),
        end: s.endOf("day").valueOf(),
        types: ["day"] as const,
      };
    } else if (periodType === "week") {
      const s = anchorDate.startOf("week");
      const e = anchorDate.endOf("week");
      return {
        start: s.valueOf(),
        end: e.valueOf(),
        types: ["day", "week"] as const,
      };
    } else if (periodType === "month") {
      const s = anchorDate.startOf("month");
      const e = anchorDate.endOf("month");
      return {
        start: s.valueOf(),
        end: e.valueOf(),
        types: ["day", "week", "month"] as const,
      };
    } else {
      const s = anchorDate.startOf("year");
      const e = anchorDate.endOf("year");
      return {
        start: s.valueOf(),
        end: e.valueOf(),
        types: ["day", "week", "month", "year"] as const,
      };
    }
  }, [periodType, anchorDate]);

  const refreshLogs = () => {
    getLogsByRange({
      startDate: range.start,
      endDate: range.end,
      periodTypes: [...range.types],
    }).then(setLogs);
  };

  useEffect(() => {
    getLogsByRange({
      startDate: range.start,
      endDate: range.end,
      periodTypes: [...range.types],
    }).then(setLogs);
  }, [range.start, range.end, range.types]);

  const handleLogClick = (log: LogEntry) => {
    setActiveLogId(log.id);
  };

  const handleDeleteLog = async (logId: number) => {
    try {
      await deleteLog(logId);
      message.success("日志删除成功");
      // 如果删除的是当前选中的日志，清空选中状态
      if (activeLogId === logId) {
        setActiveLogId(undefined);
      }
      // 刷新列表
      refreshLogs();
    } catch (error) {
      console.error("Delete log failed:", error);
      message.error("删除日志失败");
    }
  };

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 scrollbar-hide">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            暂无日志
          </div>
        ) : (
          logs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              onClick={handleLogClick}
              onDelete={handleDeleteLog}
              className={
                activeLogId === log.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/50"
                  : ""
              }
            />
          ))
        )}
      </div>
    </div>
  );
});

export default LogList;
