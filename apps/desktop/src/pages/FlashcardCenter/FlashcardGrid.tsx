import { useEffect, useMemo, useState } from "react";
import { useDebounceFn } from "ahooks";
import { AnimatePresence, motion } from "framer-motion";
import type { Flashcard } from "@/types";
import { FLASHCARD_TYPE_META, formatDueTime } from "@/utils/flashcard";

interface FlashcardGridProps {
  cards: Flashcard[];
  loading: boolean;
  filters: {
    search: string;
    tag: string;
    statuses: Flashcard["status"][];
  };
  viewMode: "overview" | "table" | "review";
  onSearch: (value: string) => void;
  onToggleStatus: (status: Flashcard["status"]) => void;
  onViewModeChange: (mode: "overview" | "table" | "review") => void;
  onCreateCard: () => void;
  onEditCard: (card: Flashcard) => void;
  onDeleteCard: (cardId: number) => Promise<void>;
  isDark: boolean;
}

const statusLabels: Record<Flashcard["status"], string> = {
  new: "新卡",
  learning: "学习中",
  review: "巩固",
  suspended: "暂停",
};

const FlashcardGrid = ({
  cards,
  loading,
  filters,
  viewMode,
  onSearch,
  onToggleStatus,
  onViewModeChange,
  onCreateCard,
  onEditCard,
  onDeleteCard,
  isDark,
}: FlashcardGridProps) => {
  const [search, setSearch] = useState(filters.search ?? "");
  const debouncedSearch = useDebounceFn(
    (value: string) => {
      onSearch(value);
    },
    { wait: 400 },
  );

  useEffect(() => {
    setSearch(filters.search ?? "");
  }, [filters.search]);

  const filteredCards = useMemo(() => cards ?? [], [cards]);

  const handleDelete = async (cardId: number) => {
    if (window.confirm("确认删除该闪卡吗？该操作不可撤销。")) {
      await onDeleteCard(cardId);
    }
  };

  const surfaceClass = isDark
    ? "bg-white/5 border border-white/10 text-white"
    : "bg-white border border-slate-200 text-slate-900 shadow-sm";
  const inputClass = isDark
    ? "border border-white/15 bg-white/5 text-white placeholder:text-slate-400"
    : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500";
  const filterInactive = isDark
    ? "bg-white/5 text-slate-300 border border-white/10"
    : "bg-slate-100 text-slate-600 border border-slate-200";
  const filterActive = isDark
    ? "bg-emerald-400/20 text-emerald-200 border border-emerald-400/40"
    : "bg-emerald-100 text-emerald-600 border border-emerald-200";
  const toggleContainerClass = isDark
    ? "bg-white/5 border-white/10"
    : "bg-slate-100 border-slate-200";
  const toggleActiveClass = isDark
    ? "bg-white text-slate-900"
    : "bg-slate-900 text-white";
  const toggleInactiveClass = isDark ? "text-slate-300" : "text-slate-500";
  const emptyStateTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const chipClass = isDark
    ? "bg-white/5 text-slate-300"
    : "bg-slate-100 text-slate-600";
  const actionBtnClass = isDark
    ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white"
    : "bg-gradient-to-r from-sky-400 to-blue-500 text-white shadow-sky-200/80";
  const deleteBtnClass = isDark
    ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
    : "bg-red-100 text-red-600 hover:bg-red-200";

  return (
    <div className="flex flex-col h-full w-full">
      <div className={`rounded-3xl p-5 backdrop-blur mb-5 ${surfaceClass}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                debouncedSearch.run(e.target.value);
              }}
              placeholder="搜索题干、标签或提示..."
              className={`w-full rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${inputClass}`}
            />
          </div>
          <div className="flex items-center gap-2">
            {(["new", "learning", "review"] as Flashcard["status"][]).map(
              (status) => {
                const active = filters.statuses.includes(status);
                return (
                  <button
                    key={status}
                    onClick={() => onToggleStatus(status)}
                    className={`px-4 py-2 rounded-full text-xs font-medium ${
                      active ? filterActive : filterInactive
                    }`}
                  >
                    {statusLabels[status]}
                  </button>
                );
              },
            )}
          </div>
          <div
            className={`flex items-center gap-2 rounded-full p-1 border ${toggleContainerClass}`}
          >
            {["overview", "table"].map((mode) => (
              <button
                key={mode}
                onClick={() => onViewModeChange(mode as "overview" | "table")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium ${
                  viewMode === mode ? toggleActiveClass : toggleInactiveClass
                }`}
              >
                {mode === "overview" ? "瀑布视图" : "表格视图"}
              </button>
            ))}
          </div>
          <button
            onClick={onCreateCard}
            className={`h-11 px-5 rounded-full text-sm font-semibold shadow-lg ${actionBtnClass}`}
          >
            添加闪卡
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto pr-2">
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-48 rounded-3xl bg-white/5 border border-white/10 animate-pulse"
              />
            ))}
          </div>
        )}
        {!loading && filteredCards.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className={`text-center ${emptyStateTextClass}`}>
              <p className="text-lg font-medium mb-2">暂无符合条件的闪卡</p>
              <p className="text-sm">
                尝试调整搜索或筛选条件，或者创建新的闪卡。
              </p>
            </div>
          </div>
        )}
        {!loading && filteredCards.length > 0 && (
          <>
            {viewMode === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-10">
                <AnimatePresence mode="popLayout">
                  {filteredCards.map((card) => (
                    <motion.div
                      key={card.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className={`rounded-3xl border backdrop-blur p-5 flex flex-col gap-4 transition ${
                        isDark
                          ? "border-white/10 bg-white/5 hover:border-emerald-400/40"
                          : "border-slate-200 bg-white hover:border-emerald-200/60 shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-medium uppercase tracking-[0.3em] ${
                            isDark ? "text-emerald-300" : "text-emerald-500"
                          }`}
                        >
                          {FLASHCARD_TYPE_META[card.type]?.label ?? "闪卡"}
                        </span>
                        <span
                          className={`text-xs ${
                            isDark ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          {card.difficulty === "foundation"
                            ? "基础"
                            : card.difficulty === "advanced"
                              ? "进阶"
                              : "常规"}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold line-clamp-2 mb-2">
                          {card.prompt}
                        </h3>
                        {card.detail && (
                          <p
                            className={`text-sm line-clamp-2 ${
                              isDark ? "text-slate-400" : "text-slate-500"
                            }`}
                          >
                            {card.detail}
                          </p>
                        )}
                      </div>
                      {card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {card.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`px-2 py-1 rounded-full text-xs ${chipClass}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        className={`flex items-center justify-between text-xs ${
                          isDark ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        <span>下一次：{formatDueTime(card.dueTime)}</span>
                        <span>复习 {card.reviewCount} 次</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => onEditCard(card)}
                          className={`flex-1 h-10 rounded-full text-sm transition ${
                            isDark
                              ? "bg-white/10 text-white hover:bg-white/20"
                              : "bg-slate-900/5 text-slate-900 hover:bg-slate-900/10"
                          }`}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(card.id)}
                          className={`h-10 px-4 rounded-full text-sm transition ${deleteBtnClass}`}
                        >
                          删除
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
            {viewMode === "table" && (
              <div
                className={`rounded-3xl overflow-hidden border ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
              >
                <table
                  className={`w-full text-sm ${isDark ? "text-slate-200" : "text-slate-700"}`}
                >
                  <thead>
                    <tr className="text-left text-slate-400 uppercase text-xs tracking-[0.3em]">
                      <th className="px-4 py-3">题干</th>
                      <th className="px-4 py-3">类型</th>
                      <th className="px-4 py-3">标签</th>
                      <th className="px-4 py-3">复习次数</th>
                      <th className="px-4 py-3">下次复习</th>
                      <th className="px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCards.map((card) => (
                      <tr
                        key={card.id}
                        className={`border-t ${isDark ? "border-white/5" : "border-slate-200"}`}
                      >
                        <td className="px-4 py-4 w-2/5">
                          <div className="font-medium">{card.prompt}</div>
                          {card.detail && (
                            <div
                              className={`text-xs ${
                                isDark ? "text-slate-400" : "text-slate-500"
                              }`}
                            >
                              {card.detail}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {FLASHCARD_TYPE_META[card.type]?.label ?? card.type}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1">
                            {card.tags.map((tag) => (
                              <span
                                key={tag}
                                className={`px-2 py-0.5 rounded-full text-xs ${chipClass}`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4">{card.reviewCount}</td>
                        <td className="px-4 py-4">
                          {formatDueTime(card.dueTime)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onEditCard(card)}
                              className={`px-3 py-1 rounded-full text-xs ${
                                isDark
                                  ? "bg-white/10 hover:bg-white/20"
                                  : "bg-slate-900/5 hover:bg-slate-900/10"
                              }`}
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDelete(card.id)}
                              className={`px-3 py-1 rounded-full text-xs ${deleteBtnClass}`}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FlashcardGrid;
