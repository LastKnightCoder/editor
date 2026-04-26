import { useState, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MdClose, MdPlaylistAddCheck } from "react-icons/md";
import { App } from "antd";
import { PomodoroSession } from "@/types";
import CustomCheckbox from "@/components/CustomCheckbox";
import "@/pages/Calendar/components/EventDialog/index.css";

interface BatchManageModalProps {
  open: boolean;
  onCancel: () => void;
  sessions: PomodoroSession[];
  presets: Map<number, string>;
  onDelete: (sessionIds: number[]) => Promise<void>;
  hasMoreSessions: boolean;
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
  ({ open, onCancel, sessions, presets, onDelete, hasMoreSessions }) => {
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
        zIndex: 10000,
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

    if (!open) return null;

    return createPortal(
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-[640px] m-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-zinc-900/95 border border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-start gap-3 mb-5 shrink-0">
                <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
                  <MdPlaylistAddCheck className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                    批量管理专注记录
                  </h2>
                  <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                    选择需要删除的番茄钟记录
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200"
                >
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              {/* 全选 */}
              <div className="mb-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                <CustomCheckbox
                  checked={
                    selectedIds.length === sessions.length &&
                    sessions.length > 0
                  }
                  onChange={handleToggleAll}
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">
                  全选（当前已加载 {sessions.length} 条
                  {hasMoreSessions ? "，可继续加载更多" : ""}）
                </span>
              </div>

              {/* 列表 */}
              <div className="flex-1 overflow-y-auto event-modal-scroll pr-1 min-h-0 max-h-[60vh]">
                {groups.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-slate-400 text-center py-12">
                    暂无记录
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groups.map(([dateKey, list]) => {
                      const firstSession = list[0];
                      const displayDate = formatDate(firstSession.startTime);

                      return (
                        <div key={dateKey}>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-3">
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
                                ? new Date(session.endTime).toLocaleTimeString(
                                    "zh-CN",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : null;
                              const presetName =
                                presets.get(session.presetId) || "未知预设";
                              const focusMinutes = Math.round(
                                (session.focusMs || 0) / 60000,
                              );
                              const selected = selectedIds.includes(session.id);

                              return (
                                <div
                                  key={session.id}
                                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                    selected
                                      ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/40"
                                      : "bg-gray-50 dark:bg-zinc-950 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-zinc-800"
                                  }`}
                                  onClick={() => handleToggle(session.id)}
                                >
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <CustomCheckbox
                                      checked={selected}
                                      onChange={() => handleToggle(session.id)}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-gray-500 dark:text-slate-400">
                                      {startTime} - {endTime || "进行中"}
                                    </div>
                                    <div className="text-sm mt-0.5 text-gray-800 dark:text-slate-200 truncate">
                                      {presetName}
                                    </div>
                                  </div>
                                  <div className="text-sm font-medium text-gray-600 dark:text-slate-300 shrink-0">
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
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center pt-4 mt-4 border-t border-white/20 dark:border-white/10 shrink-0">
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  已选择 {selectedIds.length} 条记录
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-5 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={selectedIds.length === 0}
                    className="px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-red-500 text-white shadow-[0_4px_14px_rgba(239,68,68,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-red-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0"
                  >
                    删除选中
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body,
    );
  },
);

BatchManageModal.displayName = "BatchManageModal";

export default BatchManageModal;
