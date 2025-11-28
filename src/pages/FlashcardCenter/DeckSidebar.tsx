import { motion } from "framer-motion";
import type { FlashcardDeck } from "@/types";

interface DeckSidebarProps {
  decks: FlashcardDeck[];
  activeDeckId: number | null;
  loading: boolean;
  onSelect: (deckId: number) => void;
  onCreate: () => void;
  onEdit: (deck: FlashcardDeck) => void;
  isDark: boolean;
}

const DeckSidebar = ({
  decks,
  activeDeckId,
  loading,
  onSelect,
  onCreate,
  onEdit,
  isDark,
}: DeckSidebarProps) => {
  const containerClass = isDark
    ? "border-white/5 bg-slate-950/30 text-white"
    : "border-slate-200 bg-white/80 text-slate-900";
  const actionButtonClass = isDark
    ? "bg-white/10 text-white hover:bg-white/20"
    : "bg-slate-900/5 text-slate-900 hover:bg-slate-900/10";
  const placeholderClass = isDark ? "bg-white/5" : "bg-slate-200/70";
  const emptyStateClass = isDark
    ? "border-white/10 text-slate-400"
    : "border-slate-200 text-slate-500";

  return (
    <aside
      className={`w-[280px] flex-shrink-0 h-full border-r backdrop-blur-lg px-4 py-6 flex flex-col ${containerClass}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <p
            className={`text-xs uppercase tracking-[0.4em] ${
              isDark ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Decks
          </p>
          <h2 className="mt-1 text-lg font-semibold">卡组列表</h2>
        </div>
        <button
          onClick={onCreate}
          className={`h-9 px-4 rounded-full text-sm font-medium transition ${actionButtonClass}`}
        >
          新建
        </button>
      </div>
      <div className="flex-1 overflow-auto space-y-3 pr-1">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className={`h-20 rounded-2xl animate-pulse ${placeholderClass}`}
              />
            ))}
          </div>
        )}
        {!loading && decks.length === 0 && (
          <div
            className={`rounded-2xl border border-dashed p-4 text-sm text-center ${emptyStateClass}`}
          >
            还没有任何卡组，点击“新建”立即开始吧。
          </div>
        )}
        {!loading &&
          decks.map((deck) => {
            const isActive = deck.id === activeDeckId;
            const stats = deck.stats;
            const dueCount = stats?.dueCount ?? 0;
            const total = stats?.totalCards ?? 0;
            const newCount = stats?.newCount ?? 0;
            const cardClass = isActive
              ? isDark
                ? "border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 to-slate-900/40"
                : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-md shadow-emerald-100/60"
              : isDark
                ? "border-white/5 bg-white/5 hover:border-white/15"
                : "border-slate-200 bg-white hover:border-slate-300";

            return (
              <motion.button
                key={deck.id}
                onClick={() => onSelect(deck.id)}
                whileHover={{ scale: 1.01 }}
                className={`w-full text-left rounded-2xl border p-4 transition ${cardClass}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-2xl">{deck.emoji ?? "🧠"}</div>
                  <button
                    className={`text-xs transition ${
                      isDark
                        ? "text-slate-400 hover:text-white"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(deck);
                    }}
                  >
                    编辑
                  </button>
                </div>
                <h3 className="mt-2 text-base font-semibold line-clamp-1">
                  {deck.name}
                </h3>
                <div
                  className={`mt-3 flex items-center justify-between text-xs ${
                    isDark ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  <span>待复习 {dueCount}</span>
                  <span>新卡 {newCount}</span>
                  <span>总计 {total}</span>
                </div>
              </motion.button>
            );
          })}
      </div>
    </aside>
  );
};

export default DeckSidebar;
