import { useState, useMemo, memo } from "react";
import { Modal, App } from "antd";
import { PomodoroSession } from "@/types";
import CustomCheckbox from "@/components/CustomCheckbox";

interface BatchManageModalProps {
  open: boolean;
  onCancel: () => void;
  sessions: PomodoroSession[];
  presets: Map<number, string>;
  onDelete: (sessionIds: number[]) => Promise<void>;
}

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

const BatchManageModal: React.FC<BatchManageModalProps> = memo(
  ({ open, onCancel, sessions, presets, onDelete }) => {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const { modal, message } = App.useApp();

    const groups = useMemo(() => groupByDate(sessions), [sessions]);

    const handleToggle = (sessionId: number) => {
      setSelectedIds((prev) => {
        if (prev.includes(sessionId)) {
          return prev.filter((id) => id !== sessionId);
        } else {
          return [...prev, sessionId];
        }
      });
    };

    const handleToggleAll = () => {
      if (selectedIds.length === sessions.length) {
        setSelectedIds([]);
      } else {
        setSelectedIds(sessions.map((s) => s.id));
      }
    };

    const handleDelete = () => {
      if (selectedIds.length === 0) {
        message.warning("请先选择要删除的记录");
        return;
      }

      modal.confirm({
        title: "批量删除专注记录",
        content: `确定要删除选中的 ${selectedIds.length} 条专注记录吗？删除后无法恢复。`,
        okText: "确认删除",
        okButtonProps: {
          danger: true,
        },
        cancelText: "取消",
        onOk: async () => {
          try {
            await onDelete(selectedIds);
            setSelectedIds([]);
            message.success(`成功删除 ${selectedIds.length} 条记录`);
          } catch (error) {
            console.error("Failed to delete sessions:", error);
            message.error("删除失败，请重试");
          }
        },
      });
    };

    const handleCancel = () => {
      setSelectedIds([]);
      onCancel();
    };

    return (
      <Modal
        title="批量管理专注记录"
        open={open}
        onCancel={handleCancel}
        width={600}
        footer={
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              已选择 {selectedIds.length} 条记录
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="px-4 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={selectedIds.length === 0}
                className="px-4 py-1.5 rounded bg-red-500 text-white hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                删除选中
              </button>
            </div>
          </div>
        }
      >
        <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <CustomCheckbox
            checked={
              selectedIds.length === sessions.length && sessions.length > 0
            }
            onChange={handleToggleAll}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            全选（共 {sessions.length} 条）
          </span>
        </div>

        <div className="max-h-[500px] overflow-y-auto space-y-6">
          {groups.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              暂无记录
            </div>
          )}
          {groups.map(([dateKey, list]) => {
            const firstSession = list[0];
            const displayDate = formatDate(firstSession.startTime);

            return (
              <div key={dateKey}>
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                  {displayDate}
                </div>
                <div className="space-y-2">
                  {list.map((session) => {
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
                      presets.get(session.presetId) || "未知预设";
                    const focusMinutes = Math.round(
                      (session.focusMs || 0) / 60000,
                    );

                    return (
                      <div
                        key={session.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        onClick={() => handleToggle(session.id)}
                      >
                        <div onClick={(e) => e.stopPropagation()}>
                          <CustomCheckbox
                            checked={selectedIds.includes(session.id)}
                            onChange={() => handleToggle(session.id)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {startTime} - {endTime || "进行中"}
                          </div>
                          <div className="text-base mt-1 dark:text-gray-200">
                            {presetName}
                          </div>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {focusMinutes}m
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    );
  },
);

BatchManageModal.displayName = "BatchManageModal";

export default BatchManageModal;
