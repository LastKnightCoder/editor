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
  sessions.forEach(s => {
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
      setSelectedIds(prev => {
        if (prev.includes(sessionId)) {
          return prev.filter(id => id !== sessionId);
        } else {
          return [...prev, sessionId];
        }
      });
    };

    const handleToggleAll = () => {
      if (selectedIds.length === sessions.length) {
        setSelectedIds([]);
      } else {
        setSelectedIds(sessions.map(s => s.id));
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
          className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="m-4 flex max-h-[90vh] w-full max-w-[640px] flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
              {/* Header */}
              <div className="mb-5 flex shrink-0 items-start gap-3">
                <div className="border-[var(--th-border-focus)]/30 dark:border-[var(--th-border-focus)]/30 dark:bg-[var(--th-accent)]/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
                  <MdPlaylistAddCheck className="h-5 w-5 text-[var(--th-accent)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                    批量管理专注记录
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                    选择需要删除的番茄钟记录
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
                >
                  <MdClose className="h-5 w-5" />
                </button>
              </div>

              {/* 全选 */}
              <div className="mb-4 flex shrink-0 items-center gap-2 border-b border-gray-200 pb-3 dark:border-slate-700">
                <CustomCheckbox
                  checked={selectedIds.length === sessions.length && sessions.length > 0}
                  onChange={handleToggleAll}
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">
                  全选（当前已加载 {sessions.length} 条{hasMoreSessions ? "，可继续加载更多" : ""}）
                </span>
              </div>

              {/* 列表 */}
              <div className="event-modal-scroll max-h-[60vh] min-h-0 flex-1 overflow-y-auto pr-1">
                {groups.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500 dark:text-slate-400">
                    暂无记录
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groups.map(([dateKey, list]) => {
                      const firstSession = list[0];
                      const displayDate = formatDate(firstSession.startTime);

                      return (
                        <div key={dateKey}>
                          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            {displayDate}
                          </div>
                          <div className="space-y-2">
                            {list.map(session => {
                              const startTime = new Date(session.startTime).toLocaleTimeString(
                                "zh-CN",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              );
                              const endTime = session.endTime
                                ? new Date(session.endTime).toLocaleTimeString("zh-CN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : null;
                              const presetName = presets.get(session.presetId) || "未知预设";
                              const focusMinutes = Math.round((session.focusMs || 0) / 60000);
                              const selected = selectedIds.includes(session.id);

                              return (
                                <div
                                  key={session.id}
                                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
                                    selected
                                      ? "border-[var(--th-border-focus)]/40 bg-[var(--th-accent-soft)]"
                                      : "border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-slate-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
                                  }`}
                                  onClick={() => handleToggle(session.id)}
                                >
                                  <div onClick={e => e.stopPropagation()}>
                                    <CustomCheckbox
                                      checked={selected}
                                      onChange={() => handleToggle(session.id)}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs text-gray-500 dark:text-slate-400">
                                      {startTime} - {endTime || "进行中"}
                                    </div>
                                    <div className="mt-0.5 truncate text-sm text-gray-800 dark:text-slate-200">
                                      {presetName}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-sm font-medium text-gray-600 dark:text-slate-300">
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
              <div className="mt-4 flex shrink-0 items-center justify-between border-t border-white/20 pt-4 dark:border-white/10">
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  已选择 {selectedIds.length} 条记录
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={selectedIds.length === 0}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-red-500 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(239,68,68,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-red-600 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:hover:translate-y-0 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                  >
                    删除选中
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body
    );
  }
);

BatchManageModal.displayName = "BatchManageModal";

export default BatchManageModal;
