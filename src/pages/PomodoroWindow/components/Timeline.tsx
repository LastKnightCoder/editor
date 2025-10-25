import { useMemo, useState } from "react";
import { App, Dropdown, Empty } from "antd";
import { EllipsisOutlined, MoreOutlined } from "@ant-design/icons";
import { PomodoroSession } from "@/types";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
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
  const [batchManageOpen, setBatchManageOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<PomodoroSession | null>(
    null,
  );
  const { modal, message } = App.useApp();

  const groups = useMemo(() => groupByDate(sessions), [sessions]);

  const presetMap = useMemo(() => {
    const map = new Map<number, string>();
    presets.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [presets]);

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
      <div className="mb-4 flex-shrink-0 flex items-center justify-between">
        <div className="text-sm text-gray-500 dark:text-gray-400">专注记录</div>
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
          <MoreOutlined className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 cursor-pointer text-base" />
        </Dropdown>
      </div>

      <div className="space-y-6 overflow-y-auto scrollbar-hide flex-1">
        {groups.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <Empty description="暂无专注记录" />
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
                        <div className="flex items-start justify-between group">
                          <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {startTime} - {endTime || "进行中"}
                            </div>
                            <div className="text-base mt-1 dark:text-gray-200">
                              {presetName}
                            </div>
                          </div>

                          {/* 右侧：时长和操作 */}
                          <div className="flex items-center gap-2">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
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
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
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
      </div>

      <BatchManageModal
        open={batchManageOpen}
        onCancel={() => setBatchManageOpen(false)}
        sessions={sessions}
        presets={presetMap}
        onDelete={handleBatchDelete}
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
