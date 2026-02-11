import { motion } from "motion/react";
import type { FlashcardDeck } from "@/types";

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
  [key: string]: string;
}

interface DeckSidebarProps {
  decks: FlashcardDeck[];
  activeDeckId: number | null;
  loading: boolean;
  onSelect: (deckId: number) => void;
  onCreate: () => void;
  onEdit: (deck: FlashcardDeck) => void;
  themeColors: ThemeColors;
}

const DeckSidebar = ({
  decks,
  activeDeckId,
  loading,
  onSelect,
  onCreate,
  onEdit,
  themeColors,
}: DeckSidebarProps) => {
  return (
    <aside
      className={`w-full shrink-0 h-full border-r backdrop-blur-lg px-4 py-6 flex flex-col relative ${themeColors.borderClass}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className={`mt-1 text-lg font-semibold ${themeColors.activeTextClass}`}
          >
            卡组列表
          </h2>
        </div>
        <button
          onClick={onCreate}
          className={`h-9 px-4 rounded-full text-sm font-medium transition ${themeColors.tagBgClass} ${themeColors.activeTextClass} ${themeColors.hoverClass}`}
        >
          新建
        </button>
      </div>
      <div className="flex-1 overflow-auto space-y-3 p-1">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className={`h-20 rounded-2xl animate-pulse ${themeColors.tagBgClass}`}
              />
            ))}
          </div>
        )}
        {!loading && decks.length === 0 && (
          <div
            className={`rounded-2xl border border-dashed p-4 text-sm text-center ${themeColors.borderClass} ${themeColors.textClass}`}
          >
            还没有任何卡组，点击"新建"立即开始吧。
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
              ? `${themeColors.activeBorderClass} ${themeColors.activeBgClass} border-l-4 ${themeColors.hoverClass}`
              : `${themeColors.cardBorderClass} ${themeColors.cardBgClass} ${themeColors.hoverBorderClass} ${themeColors.hoverClass}`;

            return (
              <motion.button
                key={deck.id}
                onClick={() => onSelect(deck.id)}
                className={`w-full text-left rounded-2xl border p-4 transition ${cardClass}`}
                style={
                  isActive
                    ? { borderLeftColor: themeColors.accentColor }
                    : undefined
                }
              >
                <div className="flex items-center justify-between">
                  <div className="text-2xl">{deck.emoji ?? "🧠"}</div>
                  <button
                    className={`text-xs transition ${themeColors.textClass} ${themeColors.hoverTextClass}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(deck);
                    }}
                  >
                    编辑
                  </button>
                </div>
                <h3
                  className={`mt-2 text-base font-semibold line-clamp-1 ${themeColors.activeTextClass}`}
                >
                  {deck.name}
                </h3>
                <div
                  className={`mt-3 flex items-center justify-between text-xs ${themeColors.textClass}`}
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
