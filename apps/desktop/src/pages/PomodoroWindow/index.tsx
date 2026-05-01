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
import classNames from "classnames";
import { MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { Dropdown, App, Empty, Button } from "antd";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { fmt, FIVE_MINUTES_MS } from "./utils";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { HiMusicNote } from "react-icons/hi";
import useThemeColors from "@/hooks/useThemeColors";
import useSettingStore from "@/stores/useSettingStore";
import { motion, AnimatePresence } from "motion/react";

const SIXTY_MIN_MS = 60 * 60 * 1000;
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const formatFocusTime = (ms: number) => {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

enum TabType {
  Active = "active",
  Archived = "archived",
}

const PomodoroWindowPage: React.FC = () => {
  const { modal } = App.useApp();
  const themeColors = useThemeColors();
  const isDarkMode = useSettingStore((state) => state.setting.darkMode);

  const {
    activeSession,
    initPomodoro,
    elapsedMs,
    remainMs,
    rightSidebarWidth,
    presets,
    refreshPresets,
    refreshSummary,
    today,
    total,
  } = usePomodoroStore();

  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PomodoroPreset | null>(
    null,
  );
  const [tabType, setTabType] = useState<TabType>(TabType.Active);

  useDatabaseChangeEffect(() => {
    initPomodoro();
  });

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const scheduleNextRefresh = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      timeoutId = setTimeout(() => {
        refreshSummary();
        scheduleNextRefresh();
      }, msUntilMidnight);
    };

    scheduleNextRefresh();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [refreshSummary]);

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
        },
      });
    } else {
      await stopPomodoroSession(true);
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

  return (
    <div className="p-4 w-full h-full flex flex-col">
      <div className="flex flex-none h-10 items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          番茄专注
        </h2>
        <div className="flex flex-none gap-1">
          <div
            className={classNames(
              "flex px-3 h-8 leading-8 items-center rounded-full cursor-pointer text-sm transition-all",
              {
                [classNames(themeColors.buttonBg, themeColors.buttonTextClass)]:
                  tabType === TabType.Active,
                [classNames(themeColors.textClass, themeColors.hoverClass)]:
                  tabType !== TabType.Active,
              },
            )}
            onClick={() => changeTab(TabType.Active)}
          >
            坚持中
          </div>
          <div
            className={classNames(
              "flex px-3 h-8 leading-8 items-center rounded-full cursor-pointer text-sm transition-all",
              {
                [classNames(themeColors.buttonBg, themeColors.buttonTextClass)]:
                  tabType === TabType.Archived,
                [classNames(themeColors.textClass, themeColors.hoverClass)]:
                  tabType !== TabType.Archived,
              },
            )}
            onClick={() => changeTab(TabType.Archived)}
          >
            已归档
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={classNames(
              "w-8 h-8 cursor-pointer flex items-center justify-center px-3 py-1 rounded-full transition-colors",
              themeColors.textClass,
              themeColors.hoverClass,
            )}
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
            <div
              className={classNames(
                "w-8 h-8 cursor-pointer flex items-center justify-center px-3 py-1 rounded-full transition-colors",
                themeColors.textClass,
                themeColors.hoverClass,
              )}
            >
              <MoreOutlined />
            </div>
          </Dropdown>
        </div>
      </div>

      <DndProvider>
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-hide">
              {filteredPresets.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {filteredPresets.map((p) => (
                    <PresetItem
                      key={p.id}
                      active={activeSession?.presetId === p.id}
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
                    />
                  ))}
                </ul>
              ) : (
                <div className="h-full min-h-full flex items-center justify-center">
                  <Empty description="暂无番茄钟">
                    {tabType === TabType.Active && (
                      <Button onClick={() => setPresetModalOpen(true)}>
                        新建番茄钟
                      </Button>
                    )}
                  </Empty>
                </div>
              )}
            </div>
            <AnimatePresence>
              {activeSession && (
                <motion.div
                  key="timer-bar"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                  className="flex-none mt-3"
                >
                  <div
                    className="rounded-xl overflow-hidden relative"
                    style={{
                      transition: "box-shadow 0.8s ease",
                      boxShadow: isRunning
                        ? `0 4px 24px -8px ${themeColors.accentSoftBg}`
                        : "none",
                    }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{ backgroundColor: themeColors.accentColor }}
                      animate={
                        isRunning
                          ? {
                              opacity: isDarkMode
                                ? [0.1, 0.15, 0.1]
                                : [0.06, 0.09, 0.06],
                            }
                          : { opacity: isDarkMode ? 0.08 : 0.05 }
                      }
                      transition={
                        isRunning
                          ? {
                              duration: 3,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }
                          : { duration: 0.5 }
                      }
                    />
                    {activeSession.expectedMs !== undefined &&
                      activeSession.expectedMs > 0 && (
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{
                            backgroundColor: themeColors.accentColor,
                            opacity: isDarkMode ? 0.08 : 0.05,
                            width: `${progress}%`,
                            transition: "width 1s linear",
                          }}
                        />
                      )}
                    <div className="relative flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="font-semibold tabular-nums tracking-wider text-gray-900 dark:text-gray-100"
                          style={{ fontSize: 22, lineHeight: 1 }}
                        >
                          {activeSession.expectedMs !== undefined
                            ? fmt(remainMs ?? 0)
                            : fmt(elapsedMs)}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[100px]">
                          {activePreset?.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-none">
                        <BackgroundSoundPanel>
                          <button
                            className={classNames(
                              "w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer transition-all",
                              themeColors.hoverClass,
                              themeColors.textClass,
                            )}
                          >
                            <HiMusicNote className="text-sm" />
                          </button>
                        </BackgroundSoundPanel>
                        {isRunning ? (
                          <button
                            className={classNames(
                              "w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer transition-all",
                              themeColors.hoverClass,
                              themeColors.activeTextClass,
                            )}
                            onClick={pause}
                          >
                            <AiOutlinePauseCircle className="text-base" />
                          </button>
                        ) : (
                          <button
                            className={classNames(
                              "w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer transition-all",
                              themeColors.hoverClass,
                              themeColors.activeTextClass,
                            )}
                            onClick={resume}
                          >
                            <AiOutlinePlayCircle className="text-base" />
                          </button>
                        )}
                        <button
                          className={classNames(
                            "w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer transition-all",
                            themeColors.hoverClass,
                            themeColors.textClass,
                          )}
                          onClick={stop}
                        >
                          <AiOutlineStop className="text-sm" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
              <div
                className={classNames(
                  "flex-none rounded-xl px-4 py-3.5 my-3",
                  isDarkMode ? "bg-white/[0.04]" : "bg-black/[0.02]",
                )}
              >
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                      今日
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tabular-nums leading-none text-gray-900 dark:text-gray-100">
                        {today.count}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        次
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                      时长
                    </div>
                    <div className="text-lg font-semibold tabular-nums leading-none text-gray-900 dark:text-gray-100">
                      {formatFocusTime(today.focusMs)}
                    </div>
                  </div>
                </div>
                <div
                  className={classNames(
                    "flex items-center gap-2 mt-3 pt-3",
                    isDarkMode
                      ? "border-t border-white/[0.06]"
                      : "border-t border-gray-200/50",
                  )}
                >
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    总计
                  </span>
                  <span className="text-sm font-medium tabular-nums text-gray-500 dark:text-gray-400">
                    {total.count}
                  </span>
                  <span className="text-xs text-gray-300 dark:text-gray-600">
                    次
                  </span>
                  <span className="text-xs text-gray-300 dark:text-gray-600">
                    ·
                  </span>
                  <span className="text-sm font-medium tabular-nums text-gray-500 dark:text-gray-400">
                    {formatFocusTime(total.focusMs)}
                  </span>
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
