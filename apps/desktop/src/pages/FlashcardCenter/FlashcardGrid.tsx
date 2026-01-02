import { useEffect, useMemo, useState } from "react";
import { useDebounceFn } from "ahooks";
import { AnimatePresence, motion } from "framer-motion";
import { App } from "antd";
import type { Flashcard } from "@/types";
import {
  FLASHCARD_TYPE_META,
  formatDueTime,
  extractPlainText,
} from "@/utils/flashcard";

interface ThemeColors {
  hoverClass: string;
  activeClass: string;
  borderClass: string;
  cardBgClass: string;
  cardBorderClass: string;
  tagBgClass: string;
  tagTextClass: string;
  textClass: string;
  secondaryTextClass: string;
  activeTextClass: string;
  activeBorderClass: string;
  activeBgClass: string;
  primaryButtonClass: string;
  inputBgClass: string;
  focusBorderClass: string;
  focusRingClass: string;
  hoverBorderClass: string;
  [key: string]: string;
}

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
  onEditCard: (card: Flashcard) => void;
  onDeleteCard: (cardId: number) => Promise<void>;
  isDark: boolean;
  themeColors: ThemeColors;
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
  onEditCard,
  onDeleteCard,
  isDark,
  themeColors,
}: FlashcardGridProps) => {
  const { modal } = App.useApp();
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
    modal.confirm({
      title: "确认删除",
      content: "确认删除该闪卡吗？该操作不可撤销。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        await onDeleteCard(cardId);
      },
    });
  };

  const deleteBtnClass = isDark
    ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
    : "bg-red-100 text-red-600 hover:bg-red-200";

  return (
    <div className="flex flex-col h-full w-full">
      <div
        className={`rounded-3xl p-5 backdrop-blur mb-5 border ${themeColors.cardBgClass} ${themeColors.cardBorderClass}`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                debouncedSearch.run(e.target.value);
              }}
              placeholder="搜索题干、标签或提示..."
              className={`w-full rounded-2xl px-4 py-3 text-sm focus:outline-none border ${themeColors.inputBgClass} ${themeColors.borderClass} ${themeColors.activeTextClass} ${themeColors.focusRingClass}`}
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
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                      active
                        ? `${themeColors.primaryButtonClass}`
                        : `${themeColors.tagBgClass} ${themeColors.textClass} ${themeColors.tagHoverBgClass}`
                    }`}
                  >
                    {statusLabels[status]}
                  </button>
                );
              },
            )}
          </div>
          <div
            className={`flex items-center gap-2 rounded-full p-1 border ${themeColors.tagBgClass} ${themeColors.borderClass}`}
          >
            {["overview", "table"].map((mode) => (
              <button
                key={mode}
                onClick={() => onViewModeChange(mode as "overview" | "table")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
                  viewMode === mode
                    ? `${themeColors.primaryButtonClass}`
                    : `${themeColors.textClass}`
                }`}
              >
                {mode === "overview" ? "瀑布视图" : "表格视图"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto pr-2">
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className={`h-48 rounded-3xl border animate-pulse ${themeColors.cardBgClass} ${themeColors.cardBorderClass}`}
              />
            ))}
          </div>
        )}
        {!loading && filteredCards.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className={`text-center ${themeColors.textClass}`}>
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
                      className={`rounded-3xl border backdrop-blur p-5 flex flex-col gap-4 transition ${themeColors.cardBorderClass} ${themeColors.cardBgClass} ${themeColors.hoverBorderClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-medium uppercase tracking-[0.3em] ${themeColors.activeTextClass}`}
                        >
                          {FLASHCARD_TYPE_META[card.type]?.label ?? "闪卡"}
                        </span>
                        <span
                          className={`text-xs ${themeColors.secondaryTextClass}`}
                        >
                          {card.difficulty === "foundation"
                            ? "基础"
                            : card.difficulty === "advanced"
                              ? "进阶"
                              : "常规"}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold line-clamp-1 mb-2 text-gray-900 dark:text-gray-100">
                          {extractPlainText(card.prompt)}
                        </h3>
                        {extractPlainText(card.detail).trim() && (
                          <p
                            className={`text-sm line-clamp-2 ${themeColors.textClass}`}
                          >
                            {extractPlainText(card.detail)}
                          </p>
                        )}
                      </div>
                      {card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {card.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`px-2 py-1 rounded-full text-xs ${themeColors.tagBgClass} ${themeColors.tagTextClass}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        className={`flex items-center justify-between text-xs ${themeColors.textClass}`}
                      >
                        <span>下一次：{formatDueTime(card.dueTime)}</span>
                        <span>复习 {card.reviewCount} 次</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => onEditCard(card)}
                          className={`flex-1 h-10 rounded-full text-sm transition ${themeColors.tagBgClass} ${themeColors.activeTextClass} ${themeColors.hoverClass}`}
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
                className={`rounded-3xl overflow-hidden border ${themeColors.cardBorderClass} ${themeColors.cardBgClass}`}
              >
                <table className={`w-full text-sm ${themeColors.textClass}`}>
                  <thead>
                    <tr
                      className={`text-left uppercase text-xs tracking-[0.3em] ${themeColors.secondaryTextClass}`}
                    >
                      <th className="px-4 py-3">题干</th>
                      <th className="px-4 py-3">类型</th>
                      <th className="px-4 py-3">标签</th>
                      <th className="px-4 py-3 whitespace-nowrap">复习次数</th>
                      <th className="px-4 py-3 whitespace-nowrap">下次复习</th>
                      <th className="px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCards.map((card) => (
                      <tr
                        key={card.id}
                        className={`border-t ${themeColors.borderClass}`}
                      >
                        <td className="px-4 py-4 w-2/5">
                          <div
                            className={`font-medium ${themeColors.activeTextClass}`}
                          >
                            {extractPlainText(card.prompt)}
                          </div>
                          {extractPlainText(card.detail).trim() && (
                            <div className={`text-xs ${themeColors.textClass}`}>
                              {extractPlainText(card.detail)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {FLASHCARD_TYPE_META[card.type]?.label ?? card.type}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1">
                            {card.tags.map((tag) => (
                              <span
                                key={tag}
                                className={`px-2 py-0.5 rounded-full text-xs ${themeColors.tagBgClass} ${themeColors.tagTextClass}`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4">{card.reviewCount}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {formatDueTime(card.dueTime)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onEditCard(card)}
                              className={`px-3 py-1 rounded-full whitespace-nowrap text-xs transition ${themeColors.tagBgClass} ${themeColors.hoverClass}`}
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDelete(card.id)}
                              className={`px-3 py-1 rounded-full whitespace-nowrap text-xs ${deleteBtnClass}`}
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
