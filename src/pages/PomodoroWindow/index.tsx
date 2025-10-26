import React, { useEffect, useState, useMemo } from "react";
import {
  createPomodoroPreset,
  updatePomodoroPreset,
  archivePomodoroPreset,
  reorderPomodoroPresets,
  startPomodoroSession,
  pausePomodoroSession,
  resumePomodoroSession,
  stopPomodoroSession,
  selectPomodoroPreset,
} from "@/commands";
import { deletePomodoroPreset } from "@/commands/pomodoro";
import { PomodoroPreset } from "@/types";
import { useMemoizedFn } from "ahooks";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import {
  AiOutlinePlayCircle,
  AiOutlineStop,
  AiOutlinePauseCircle,
} from "react-icons/ai";
import {
  openPomodoroMiniWindow,
  openPomodoroImmersiveWindow,
} from "@/commands/window";
import PresetItem from "./components/PresetItem";
import DndProvider from "@/components/DndProvider";
import PresetModal from "./components/PresetModal";
import Timeline from "./components/Timeline";
import BackgroundSoundPanel from "./components/BackgroundSoundPanel";
import useInitDatabase from "@/hooks/useInitDatabase";
import classNames from "classnames";
import { MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { Dropdown, App, Empty, Button } from "antd";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { fmt, FIVE_MINUTES_MS } from "./utils";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { HiMusicNote } from "react-icons/hi";

enum TabType {
  Active = "active",
  Archived = "archived",
}

const PomodoroWindowPage: React.FC = () => {
  useInitDatabase();

  const { modal } = App.useApp();
  const isConnected = useDatabaseConnected();

  const {
    activeSession,
    selectedPreset,
    initPomodoro,
    elapsedMs,
    remainMs,
    rightSidebarWidth,
    presets,
    refreshPresets,
    today,
    total,
  } = usePomodoroStore();

  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PomodoroPreset | null>(
    null,
  );
  const [tabType, setTabType] = useState<TabType>(TabType.Active);

  useEffect(() => {
    if (!isConnected) return;
    initPomodoro();
  }, [isConnected, initPomodoro]);

  const start = useMemoizedFn(async (p: PomodoroPreset) => {
    const expected =
      p.mode === "countdown" ? p.durationMin * 60 * 1000 : undefined;
    await startPomodoroSession(p.id, expected);
  });

  const pause = useMemoizedFn(async () => {
    await pausePomodoroSession();
  });

  const resume = useMemoizedFn(async () => {
    await resumePomodoroSession();
  });

  const stop = useMemoizedFn(async () => {
    if (elapsedMs < FIVE_MINUTES_MS) {
      modal.confirm({
        title: "专注时长不足 5 分钟",
        content: "当前专注时长不足 5 分钟，是否放弃本次记录？",
        okText: "放弃",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: async () => {
          await stopPomodoroSession(true);
          // 会话结束时会自动通过通知刷新统计数据和专注列表
        },
      });
    } else {
      await stopPomodoroSession(true);
      // 会话结束时会自动通过通知刷新统计数据和专注列表
    }
  });

  const archive = useMemoizedFn(async (p: PomodoroPreset, value: boolean) => {
    await archivePomodoroPreset(p.id, value);
    await refreshPresets();
  });

  const removePreset = useMemoizedFn(async (p: PomodoroPreset) => {
    modal.confirm({
      title: "删除预设",
      content: `删除预设 "${p.name}"？该操作不可恢复`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        await deletePomodoroPreset(p.id);
        await refreshPresets();
      },
    });
  });

  const reorderByDrag = useMemoizedFn(
    async (dragId: number, hoverId: number, place: "before" | "after") => {
      if (dragId === hoverId) return;
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
      await reorderPomodoroPresets(newOrder);
      await refreshPresets();
    },
  );

  const changeTab = useMemoizedFn((type: TabType) => {
    setTabType(type);
  });

  const handleWidthChange = useMemoizedFn((width: number) => {
    usePomodoroStore.setState({ rightSidebarWidth: width });
  });

  const filteredPresets = useMemo(() => {
    return presets.filter((p) =>
      tabType === TabType.Active ? !p.archived : p.archived,
    );
  }, [presets, tabType]);

  const activePreset = useMemo(() => {
    return presets.find((p) => p.id === activeSession?.presetId);
  }, [presets, activeSession]);

  return (
    <div className="p-4 w-full h-full flex flex-col">
      <div className="flex flex-none h-10 items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">番茄专注</h2>
        <div className="flex flex-none gap-3">
          <div
            className={classNames(
              "flex px-2 h-8 leading-8 items-center rounded-full cursor-pointer text-sm",
              {
                "bg-green-700 text-white ": tabType === TabType.Active,
              },
            )}
            onClick={() => changeTab(TabType.Active)}
          >
            坚持中
          </div>
          <div
            className={classNames(
              "flex px-2 h-8 leading-8 items-center rounded-full cursor-pointer text-sm",
              {
                "bg-gray-600 text-white dark:bg-gray-400 dark:text-white":
                  tabType === TabType.Archived,
              },
            )}
            onClick={() => changeTab(TabType.Archived)}
          >
            已归档
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 cursor-pointer flex items-center justify-center px-3 py-1 rounded-full dark:text-white text-gray-600 hover:bg-gray-200 dark:hover:bg-green-800/80"
            onClick={(e) => {
              e.stopPropagation();
              setEditingPreset(null);
              setPresetModalOpen(true);
            }}
          >
            <PlusOutlined />
          </div>
          <Dropdown
            menu={{
              items: [
                {
                  key: "open-mini-window",
                  label: "打开小窗",
                  disabled: !activeSession,
                  onClick: () => openPomodoroMiniWindow(),
                },
                {
                  key: "open-immersive-window",
                  label: "进入沉浸模式",
                  disabled: !activeSession,
                  onClick: () => openPomodoroImmersiveWindow(),
                },
              ],
            }}
          >
            <div className="w-8 h-8 cursor-pointer flex items-center justify-center px-3 py-1 rounded-full dark:text-white text-gray-600 hover:bg-gray-200 dark:hover:bg-green-800/80">
              <MoreOutlined className="text-white" />
            </div>
          </Dropdown>
        </div>
      </div>

      <DndProvider>
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="flex-1 min-w-0 h-full flex flex-col">
            <ul className="flex flex-col gap-2 flex-1 min-h-0">
              {filteredPresets.length > 0 ? (
                filteredPresets.map((p) => (
                  <PresetItem
                    key={p.id}
                    active={activeSession?.presetId === p.id}
                    selected={selectedPreset?.id === p.id}
                    status={activeSession?.status}
                    preset={p}
                    onStart={start}
                    onPause={pause}
                    onResume={resume}
                    onEdit={(pp) => {
                      setEditingPreset(pp);
                      setPresetModalOpen(true);
                    }}
                    onArchiveToggle={(pp, val) => archive(pp, val)}
                    onDelete={removePreset}
                    onReorder={reorderByDrag}
                    onClick={() => selectPomodoroPreset(p)}
                  />
                ))
              ) : (
                <div className="h-full flex items-center justify-center">
                  <Empty description="暂无番茄钟">
                    {tabType === TabType.Active && (
                      <Button onClick={() => setPresetModalOpen(true)}>
                        新建番茄钟
                      </Button>
                    )}
                  </Empty>
                </div>
              )}
            </ul>
            {activeSession && (
              <div className="flex-none flex justify-between">
                <div>
                  <div>{activePreset?.name}</div>
                  <div>
                    {activeSession.expectedMs !== undefined
                      ? fmt(remainMs ?? 0)
                      : fmt(elapsedMs)}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <BackgroundSoundPanel>
                    <button
                      className={classNames(
                        "w-8 h-8 rounded-full inline-flex items-center justify-center gap-1 cursor-pointer text-green-600 hover:text-green-500 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-900/20",
                      )}
                    >
                      <HiMusicNote className="text-lg" />
                    </button>
                  </BackgroundSoundPanel>
                  {activeSession.status === "running" ? (
                    <button
                      className={classNames(
                        "w-8 h-8 rounded-full inline-flex items-center justify-center gap-1 text-sm cursor-pointer text-green-600 hover:text-green-500 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-900/20",
                      )}
                      onClick={pause}
                    >
                      <AiOutlinePauseCircle className="text-lg" />
                    </button>
                  ) : (
                    <button
                      className={classNames(
                        "w-8 h-8 rounded-full inline-flex items-center justify-center gap-1 text-sm cursor-pointer text-green-600 hover:text-green-500 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-900/20",
                      )}
                      onClick={resume}
                    >
                      <AiOutlinePlayCircle className="text-lg" />
                    </button>
                  )}
                  <button
                    className={classNames(
                      "w-8 h-8 rounded-full inline-flex items-center justify-center gap-1 cursor-pointer text-green-600 hover:text-green-500 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-900/20",
                    )}
                    onClick={stop}
                  >
                    <AiOutlineStop className="text-lg" />
                  </button>
                </div>
              </div>
            )}
          </div>
          <ResizableAndHideableSidebar
            side="left"
            width={rightSidebarWidth}
            onWidthChange={handleWidthChange}
            open={true}
            disableResize={false}
            minWidth={300}
            maxWidth={600}
          >
            <div className="h-full flex flex-col">
              <div className="flex-none">
                <h2>概览</h2>
                <div className="grid grid-cols-2 gap-4 mt-4 flex-shrink-0">
                  <div className="rounded bg-gray-100 dark:bg-[#1a1a1a] p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      今日番茄
                    </div>
                    <div className="text-2xl font-semibold dark:text-white">
                      {today.count}
                    </div>
                  </div>
                  <div className="rounded bg-gray-100 dark:bg-[#1a1a1a] p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      今日专注时长
                    </div>
                    <div className="text-2xl font-semibold dark:text-white">
                      {Math.round(today.focusMs / 60000)}{" "}
                      <span className="text-base">m</span>
                    </div>
                  </div>
                  <div className="rounded bg-gray-100 dark:bg-[#1a1a1a] p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      总番茄
                    </div>
                    <div className="text-2xl font-semibold dark:text-white">
                      {total.count}
                    </div>
                  </div>
                  <div className="rounded bg-gray-100 dark:bg-[#1a1a1a] p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      总专注时长
                    </div>
                    <div className="text-2xl font-semibold dark:text-white">
                      {(() => {
                        const totalMinutes = Math.round(total.focusMs / 60000);
                        const hours = Math.floor(totalMinutes / 60);
                        const minutes = totalMinutes % 60;
                        if (hours > 0) {
                          return (
                            <>
                              {hours} <span className="text-base">h</span>{" "}
                              {minutes} <span className="text-base">m</span>
                            </>
                          );
                        }
                        return (
                          <>
                            {minutes} <span className="text-base">m</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <Timeline />
              </div>
            </div>
          </ResizableAndHideableSidebar>
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
          await refreshPresets();
        }}
      />
    </div>
  );
};

export default PomodoroWindowPage;
