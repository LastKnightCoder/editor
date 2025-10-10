import React, { useEffect, useState } from "react";
import {
  listPomodoroPresets,
  createPomodoroPreset,
  updatePomodoroPreset,
  archivePomodoroPreset,
  reorderPomodoroPresets,
  startPomodoroSession,
  pausePomodoroSession,
  resumePomodoroSession,
  stopPomodoroSession,
  getActivePomodoroSession,
  summaryPomodoroToday,
  summaryPomodoroTotal,
} from "@/commands";
import { deletePomodoroPreset } from "@/commands/pomodoro";
import { PomodoroPreset, PomodoroSession } from "@/types";
import { on, off } from "@/electron";
import { useMemoizedFn } from "ahooks";
import {
  AiOutlinePlayCircle,
  AiOutlinePause,
  AiOutlineStop,
} from "react-icons/ai";
import { openPomodoroMiniWindow } from "@/commands/window";
import PresetItem from "./components/PresetItem";
import DndProvider from "@/components/DndProvider";
import PresetModal from "./components/PresetModal";
import Timeline from "./components/Timeline";
import useInitDatabase from "@/hooks/useInitDatabase";

const PomodoroWindowPage: React.FC = () => {
  useInitDatabase();
  const [presets, setPresets] = useState<PomodoroPreset[]>([]);
  const [active, setActive] = useState<PomodoroSession | null>(null);
  const [today, setToday] = useState<{ count: number; focusMs: number }>({
    count: 0,
    focusMs: 0,
  });
  const [total, setTotal] = useState<{ count: number; focusMs: number }>({
    count: 0,
    focusMs: 0,
  });
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PomodoroPreset | null>(
    null,
  );
  const [working, setWorking] = useState(false);

  const refresh = useMemoizedFn(async () => {
    setPresets(await listPomodoroPresets());
    setActive(await getActivePomodoroSession());
    setToday(await summaryPomodoroToday());
    setTotal(await summaryPomodoroTotal());
  });

  useEffect(() => {
    refresh();
    const h = () => refresh();
    on && on("pomodoro:state-changed", h);
    on && on("pomodoro:tick", h);
    return () => {
      off && off("pomodoro:state-changed", h);
      off && off("pomodoro:tick", h);
    };
  }, [refresh]);

  const start = useMemoizedFn(async (p: PomodoroPreset) => {
    const expected =
      p.mode === "countdown" ? p.durationMin * 60 * 1000 : undefined;
    await startPomodoroSession(p.id, expected);
    setActive(await getActivePomodoroSession());
  });

  const pause = useMemoizedFn(async () => {
    await pausePomodoroSession();
    setActive(await getActivePomodoroSession());
  });

  const resume = useMemoizedFn(async () => {
    await resumePomodoroSession();
    setActive(await getActivePomodoroSession());
  });

  const stop = useMemoizedFn(async () => {
    await stopPomodoroSession(true);
    setActive(await getActivePomodoroSession());
    await refresh();
  });

  const archive = useMemoizedFn(async (p: PomodoroPreset, value: boolean) => {
    if (working) return;
    setWorking(true);
    try {
      await archivePomodoroPreset(p.id, value);
      await refresh();
    } finally {
      setWorking(false);
    }
  });

  const removePreset = useMemoizedFn(async (p: PomodoroPreset) => {
    if (working) return;
    if (!confirm(`删除预设 “${p.name}”？该操作不可恢复`)) return;
    setWorking(true);
    try {
      await deletePomodoroPreset(p.id);
      await refresh();
    } finally {
      setWorking(false);
    }
  });

  const reorderByDrag = useMemoizedFn(
    async (dragId: number, hoverId: number, place: "before" | "after") => {
      if (working || dragId === hoverId) return;
      const active = presets.filter((p) => !p.archived);
      const archived = presets.filter((p) => p.archived);
      const arr = active.slice();
      const dragIdx = arr.findIndex((x) => x.id === dragId);
      const hoverIdx = arr.findIndex((x) => x.id === hoverId);
      if (dragIdx === -1 || hoverIdx === -1) return;
      const [dragItem] = arr.splice(dragIdx, 1);
      const insertIdx = place === "before" ? hoverIdx : hoverIdx + 1;
      arr.splice(insertIdx > dragIdx ? insertIdx - 1 : insertIdx, 0, dragItem);
      const newOrder = [...arr, ...archived].map((x) => x.id);
      setWorking(true);
      try {
        await reorderPomodoroPresets(newOrder);
        await refresh();
      } finally {
        setWorking(false);
      }
    },
  );

  return (
    <div className="p-4 w-full h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">番茄专注</h2>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded border"
            onClick={() => {
              setEditingPreset(null);
              setPresetModalOpen(true);
            }}
          >
            新建预设
          </button>
          <button
            className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500"
            onClick={openPomodoroMiniWindow}
          >
            打开小窗
          </button>
        </div>
      </div>

      <DndProvider>
        <div className="flex gap-4">
          <div className="w-80">
            <div className="mb-2 text-sm text-gray-500">常用专注</div>
            <ul className="divide-y divide-gray-200 rounded border border-gray-200">
              {presets
                .filter((p) => !p.archived)
                .map((p) => (
                  <PresetItem
                    key={p.id}
                    preset={p}
                    onStart={start}
                    onEdit={(pp) => {
                      setEditingPreset(pp);
                      setPresetModalOpen(true);
                    }}
                    onArchiveToggle={(pp, val) => archive(pp, val)}
                    onDelete={removePreset}
                    onReorder={reorderByDrag}
                  />
                ))}
            </ul>
            <div className="mt-4 text-sm text-gray-500">已归档</div>
            <ul className="divide-y divide-gray-200 rounded border border-gray-200 mt-1">
              {presets
                .filter((p) => p.archived)
                .map((p) => (
                  <PresetItem
                    key={p.id}
                    preset={p}
                    onStart={start}
                    onEdit={(pp) => {
                      setEditingPreset(pp);
                      setPresetModalOpen(true);
                    }}
                    onArchiveToggle={(pp, val) => archive(pp, val)}
                    onDelete={removePreset}
                    onReorder={() => {
                      // noop
                    }}
                  />
                ))}
            </ul>
          </div>
          <div className="flex-1">
            <div className="mb-2 text-sm text-gray-500">当前</div>
            <div className="rounded border border-gray-200 p-4">
              {active ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    状态：{active.status}
                  </span>
                  {active.status === "running" && (
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1 rounded bg-amber-500 text-white hover:bg-amber-400"
                      onClick={pause}
                    >
                      <AiOutlinePause className="text-lg" /> 暂停
                    </button>
                  )}
                  {active.status === "paused" && (
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1 rounded bg-green-600 text-white hover:bg-green-500"
                      onClick={resume}
                    >
                      <AiOutlinePlayCircle className="text-lg" /> 继续
                    </button>
                  )}
                  <button
                    className="inline-flex items-center gap-1 px-3 py-1 rounded bg-rose-600 text-white hover:bg-rose-500"
                    onClick={stop}
                  >
                    <AiOutlineStop className="text-lg" /> 结束
                  </button>
                </div>
              ) : (
                <div className="text-sm text-gray-500">未在计时</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="rounded border border-gray-200 p-4">
                <div className="text-xs text-gray-500">今日番茄</div>
                <div className="text-2xl font-semibold">{today.count}</div>
                <div className="text-xs text-gray-500 mt-1">
                  今日专注 {Math.round(today.focusMs / 60000)}m
                </div>
              </div>
              <div className="rounded border border-gray-200 p-4">
                <div className="text-xs text-gray-500">总番茄</div>
                <div className="text-2xl font-semibold">{total.count}</div>
                <div className="text-xs text-gray-500 mt-1">
                  总专注 {Math.round(total.focusMs / 60000)}m
                </div>
              </div>
            </div>

            <Timeline />
          </div>
        </div>
      </DndProvider>

      <PresetModal
        open={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        initial={editingPreset || undefined}
        onSubmit={async (values) => {
          if (editingPreset) {
            await updatePomodoroPreset({ id: editingPreset.id, ...values });
          } else {
            await createPomodoroPreset(values);
          }
          await refresh();
        }}
      />
    </div>
  );
};

export default PomodoroWindowPage;
