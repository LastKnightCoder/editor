import { useMemo, useState } from "react";
import { App, Dropdown, Empty } from "antd";
import { EllipsisOutlined, MoreOutlined } from "@ant-design/icons";
import { PomodoroSession } from "@/types";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";
import SVG from "react-inlinesvg";
import { useMemoizedFn } from "ahooks";
import {
  deletePomodoroSession,
  deletePomodoroSessions,
  updatePomodoroSession,
} from "@/commands/pomodoro";
import stopwatchIcon from "@/assets/icons/stopwatch.svg";
import BatchManageModal from "./BatchManageModal";
import EditSessionModal from "./EditSessionModal";

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
  const hasMoreSessions = usePomodoroStore((state) => state.hasMoreSessions);
  const loadingMoreSessions = usePomodoroStore(
    (state) => state.loadingMoreSessions,
  );
  const loadMoreSessions = usePomodoroStore((state) => state.loadMoreSessions);
  const [batchManageOpen, setBatchManageOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<PomodoroSession | null>(
    null,
  );
  const { modal, message } = App.useApp();
  const themeColors = useThemeColors();

  const groups = useMemo(() => groupByDate(sessions), [sessions]);

  const presetMap = useMemo(() => {
    const map = new Map<number, string>();
    presets.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [presets]);

  const handleLoadMore = useMemoizedFn(async () => {
    try {
      await loadMoreSessions();
    } catch (error) {
      console.error("Failed to load more pomodoro sessions:", error);
      message.error("加载更多记录失败，请重试");
    }
  });

  const handleDeleteSession = (sessionId: number) => {
    modal.confirm({
      title: "删除专注记录",
      content: "确定要删除这条专注记录吗？删除后无法恢复。",
      okText: "确认删除",
      okButtonProps: {
        danger: true,
      },
      cancelText: "取消",
      onOk: async () => {
        try {
          await deletePomodoroSession(sessionId);
          await usePomodoroStore.getState().refreshSessions();
          message.success("删除成功");
        } catch (error) {
          console.error("Failed to delete session:", error);
          message.error("删除失败，请重试");
        }
      },
    });
  };

  const handleOpenBatchManage = () => {
    setBatchManageOpen(true);
  };

  const handleBatchDelete = async (sessionIds: number[]) => {
    await deletePomodoroSessions(sessionIds);
    await usePomodoroStore.getState().refreshSessions();
    setBatchManageOpen(false);
  };

  const handleEditSession = (session: PomodoroSession) => {
    setEditingSession(session);
    setEditModalOpen(true);
  };

  const handleUpdateSession = async (focusMs: number) => {
    if (!editingSession) return;

    try {
      await updatePomodoroSession(editingSession.id, focusMs);
      await usePomodoroStore.getState().refreshSessions();
      message.success("更新成功");
      setEditModalOpen(false);
      setEditingSession(null);
    } catch (error) {
      console.error("Failed to update session:", error);
      message.error("更新失败，请重试");
    }
  };

  return (
    <div className="mt-6 h-full flex flex-col overflow-hidden">
      <div className="mb-4 shrink-0 flex items-center justify-between">
        <div
          className={classNames(
            "text-sm transition-colors",
            themeColors.textClass,
          )}
        >
          专注记录
        </div>
        <Dropdown
          menu={{
            items: [
              {
                key: "batch",
                label: "批量管理",
                onClick: handleOpenBatchManage,
              },
            ],
          }}
          trigger={["click"]}
        >
          <MoreOutlined
            className={classNames(
              "cursor-pointer text-base transition-colors",
              themeColors.textClass,
              themeColors.hoverTextClass,
            )}
          />
        </Dropdown>
      </div>

      <div className="space-y-6 overflow-y-auto scrollbar-hide flex-1 pr-1">
        {groups.length === 0 && (
          <div
            className={classNames(
              "text-sm transition-colors",
              themeColors.textClass,
            )}
          >
            <Empty description="暂无专注记录" />
          </div>
        )}
        {groups.map(([dateKey, list]) => {
          const firstSession = list[0];
          const displayDate = formatDate(firstSession.startTime);

          return (
            <div key={dateKey}>
              <div
                className={classNames(
                  "text-sm mb-3 opacity-60 transition-colors",
                  themeColors.textClass,
                )}
              >
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
                          className={classNames(
                            "absolute w-[2px] z-0 transition-colors",
                            themeColors.divideCalass,
                          )}
                          style={{
                            left: "calc(1rem - 1px)",
                            top: "2.25rem",
                            bottom: "0.25rem",
                          }}
                        />
                      )}
                      {isLast && (
                        <div
                          className={classNames(
                            "absolute w-[2px] z-0 transition-colors",
                            themeColors.divideCalass,
                          )}
                          style={{
                            left: "calc(1rem - 1px)",
                            top: "2.25rem",
                            height: "0.75rem",
                          }}
                        />
                      )}

                      {/* 左侧：图标和圆圈 */}
                      <div className="flex flex-col items-center relative shrink-0">
                        <div
                          className={classNames(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                            themeColors.hoverClass,
                          )}
                        >
                          <SVG
                            src={stopwatchIcon}
                            className={classNames(
                              "w-5 h-5",
                              themeColors.activeTextClass,
                            )}
                          />
                        </div>
                        <div
                          className={classNames(
                            "w-2 h-2 border rounded-full mt-3 relative z-10 transition-colors",
                            themeColors.cardBgClass,
                            themeColors.focusBorderClass,
                          )}
                        />
                      </div>

                      {/* 中间和右侧：内容 */}
                      <div className="flex-1 pb-8">
                        <div className="flex items-start justify-between group">
                          <div>
                            <div
                              className={classNames(
                                "text-sm transition-colors",
                                themeColors.textClass,
                              )}
                            >
                              {startTime} - {endTime || "进行中"}
                            </div>
                            <div
                              className={classNames(
                                "text-base mt-1 transition-colors",
                                themeColors.activeTextClass,
                              )}
                            >
                              {presetName}
                            </div>
                          </div>

                          {/* 右侧：时长和操作 */}
                          <div className="flex items-center gap-2">
                            <div
                              className={classNames(
                                "text-sm transition-colors",
                                themeColors.textClass,
                              )}
                            >
                              {focusMinutes}m
                            </div>
                            <Dropdown
                              menu={{
                                items: [
                                  {
                                    key: "edit",
                                    label: "编辑记录",
                                    onClick: () => handleEditSession(session),
                                  },
                                  {
                                    key: "delete",
                                    label: "删除记录",
                                    onClick: () =>
                                      handleDeleteSession(session.id),
                                  },
                                ],
                              }}
                              trigger={["click"]}
                            >
                              <EllipsisOutlined
                                className={classNames(
                                  "cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity",
                                  themeColors.textClass,
                                  themeColors.hoverTextClass,
                                )}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Dropdown>
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
        {(hasMoreSessions || loadingMoreSessions) && (
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMoreSessions}
              className={classNames(
                "px-4 py-2 rounded-full text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed",
                themeColors.cardBgClass,
                themeColors.textClass,
                themeColors.hoverClass,
              )}
            >
              {loadingMoreSessions ? "正在加载..." : "加载更多记录"}
            </button>
          </div>
        )}
      </div>

      <BatchManageModal
        open={batchManageOpen}
        onCancel={() => setBatchManageOpen(false)}
        sessions={sessions}
        presets={presetMap}
        onDelete={handleBatchDelete}
        hasMoreSessions={hasMoreSessions}
      />

      <EditSessionModal
        session={editingSession}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingSession(null);
        }}
        onOk={handleUpdateSession}
      />
    </div>
  );
};

export default Timeline;
