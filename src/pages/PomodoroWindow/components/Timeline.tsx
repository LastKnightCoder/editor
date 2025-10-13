import {
  useEffect,
  useMemo,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { PomodoroPreset, PomodoroSession } from "@/types";
import { listPomodoroSessions, listPomodoroPresets } from "@/commands";
import { useMemoizedFn } from "ahooks";

type Range = 7 | 30;

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

export type TimelineRefHandler = {
  refresh: () => void;
};

const Timeline = forwardRef<TimelineRefHandler>((_, ref) => {
  const [range, setRange] = useState<Range>(7);
  const [records, setRecords] = useState<PomodoroSession[]>([]);
  const [presets, setPresets] = useState<PomodoroPreset[]>([]);
  const [status, setStatus] = useState<
    "all" | "completed" | "running" | "paused"
  >("all");
  const [presetId, setPresetId] = useState<number | "all">("all");

  const refresh = useMemoizedFn(async () => {
    const end = Date.now();
    const start = end - range * 24 * 60 * 60 * 1000;
    const list = await listPomodoroSessions({
      start,
      end,
      status: status === "all" ? undefined : (status as any),
      presetId: presetId === "all" ? undefined : (presetId as number),
      limit: 1000,
    });
    setRecords(list);
  });

  useEffect(() => {
    refresh();
  }, [range, status, presetId, refresh]);

  useEffect(() => {
    listPomodoroPresets().then((ps) => setPresets(ps));
  }, []);

  const groups = useMemo(() => groupByDate(records), [records]);

  useImperativeHandle(ref, () => ({
    refresh,
  }));

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-500">专注记录</div>
        <div className="flex items-center gap-2 text-sm">
          <select
            className="border rounded px-2 py-1"
            value={presetId === "all" ? "all" : String(presetId)}
            onChange={(e) => {
              const v = e.target.value;
              setPresetId(v === "all" ? "all" : Number(v));
            }}
          >
            <option value="all">全部预设</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="border rounded px-2 py-1"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="all">全部</option>
            <option value="completed">已完成</option>
            <option value="running">进行中</option>
            <option value="paused">已暂停</option>
          </select>
          <button
            className={`px-2 py-0.5 rounded border ${range === 7 ? "bg-gray-100" : ""}`}
            onClick={() => setRange(7)}
          >
            近7天
          </button>
          <button
            className={`px-2 py-0.5 rounded border ${range === 30 ? "bg-gray-100" : ""}`}
            onClick={() => setRange(30)}
          >
            近30天
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {groups.length === 0 && (
          <div className="text-sm text-gray-500">暂无记录</div>
        )}
        {groups.map(([date, list]) => (
          <div key={date} className="border rounded p-3">
            <div className="text-sm text-gray-600 mb-2">{date}</div>
            <div className="space-y-2">
              {list.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="text-gray-700">
                    {new Date(s.startTime).toLocaleTimeString()} ~
                    {s.endTime
                      ? ` ${new Date(s.endTime).toLocaleTimeString()}`
                      : " 进行中"}
                  </div>
                  <div className="text-gray-500">
                    专注 {Math.round((s.focusMs || 0) / 60000)}m
                    {s.pauseTotalMs > 0
                      ? ` · 暂停 ${Math.round(s.pauseTotalMs / 60000)}m`
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default Timeline;
