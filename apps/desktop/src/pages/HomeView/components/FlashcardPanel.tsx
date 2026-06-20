import React from "react";
import classNames from "classnames";
import { ArrowRight, Brain } from "lucide-react";

import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import type { FlashcardDeck } from "@/types";

interface FlashcardPanelProps {
  decks: FlashcardDeck[];
  totalDue: number;
}

const FlashcardPanel: React.FC<FlashcardPanelProps> = ({ decks, totalDue }) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();
  const previewDecks = [...decks]
    .filter((deck) => (deck.stats?.totalCards ?? 0) > 0)
    .sort((a, b) => (b.stats?.dueCount ?? 0) - (a.stats?.dueCount ?? 0))
    .slice(0, 4);

  return (
    <div
      className={classNames(
        "flex h-[260px] flex-col rounded-xl border p-4",
        themeColors.cardBorderClass,
        themeColors.cardBgClass,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={classNames(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              themeColors.iconBgClass,
            )}
          >
            <Brain
              className={classNames("h-4 w-4", themeColors.iconTextClass)}
            />
          </div>
          <h3
            className={classNames(
              "text-sm font-semibold",
              themeColors.textClass,
            )}
          >
            待复习
          </h3>
          {totalDue > 0 && (
            <span
              className={classNames(
                "rounded-full px-1.5 py-0.5 text-xs font-medium",
                themeColors.badgeBgClass,
                themeColors.badgeTextClass,
              )}
            >
              {totalDue}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => createTab(TabType.FlashcardCenter)}
          className={classNames(
            "flex items-center gap-1 text-xs transition-colors",
            themeColors.secondaryTextClass,
            "hover:opacity-80",
          )}
        >
          开始复习
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {previewDecks.length === 0 ? (
        <div
          className={classNames(
            "flex flex-1 items-center justify-center text-sm",
            themeColors.secondaryTextClass,
          )}
        >
          暂无闪卡集
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
          {previewDecks.map((deck) => (
            <button
              key={deck.id}
              type="button"
              className={classNames(
                "grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                themeColors.hoverClass,
              )}
              onClick={() => createTab(TabType.FlashcardCenter)}
            >
              <span className="text-xl leading-none">{deck.emoji || "📚"}</span>
              <div className="min-w-0">
                <p
                  className={classNames(
                    "truncate text-sm font-medium",
                    themeColors.textClass,
                  )}
                >
                  {deck.name}
                </p>
                <div
                  className={classNames(
                    "mt-0.5 flex items-center gap-2 text-xs",
                    themeColors.secondaryTextClass,
                  )}
                >
                  <span>{deck.stats?.totalCards ?? 0} 张</span>
                  <span>{deck.stats?.newCount ?? 0} 新</span>
                  <span>{deck.stats?.learningCount ?? 0} 学习中</span>
                </div>
              </div>
              <span
                className={classNames(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                  themeColors.badgeBgClass,
                  themeColors.badgeTextClass,
                )}
              >
                {deck.stats?.dueCount ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FlashcardPanel;
