import { motion } from "motion/react";
import { Check, CheckCircle2, Clock } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import type { BadgeManualEntry } from "@/types";

export interface CheckInManualItem {
  manualKey: string;
  manualLabel: string;
  completedEntry?: BadgeManualEntry;
}

export interface CheckInCardProps {
  definitionId: number;
  definitionName: string;
  manualItems: CheckInManualItem[];
  onCheckIn: (manualKey: string) => void;
  index?: number;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

const CheckInCard = ({
  definitionName,
  manualItems,
  onCheckIn,
  index = 0,
}: CheckInCardProps) => {
  const themeColors = useThemeColors();
  const completedCount = manualItems.filter(
    (item) => !!item.completedEntry,
  ).length;
  const allCompleted = completedCount === manualItems.length;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.05,
        type: "spring",
        stiffness: 240,
        damping: 24,
      }}
      className={`relative flex flex-col gap-3 overflow-hidden rounded-3xl border p-5 backdrop-blur transition ${themeColors.cardBorderClass} ${themeColors.cardBgClass}`}
    >
      {allCompleted && (
        <motion.div
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/20 blur-3xl"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
        />
      )}

      {/* 标题行 */}
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`truncate text-base font-semibold ${themeColors.activeTextClass}`}
        >
          {definitionName}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            allCompleted
              ? "bg-emerald-500/15 text-emerald-400"
              : completedCount > 0
                ? "bg-amber-500/15 text-amber-400"
                : "bg-orange-500/15 text-orange-400"
          }`}
        >
          {allCompleted
            ? "今日已完成"
            : completedCount > 0
              ? `${completedCount}/${manualItems.length} 已打卡`
              : "待打卡"}
        </span>
      </div>

      {/* 手动项列表 */}
      <div className="flex flex-col gap-1.5">
        {manualItems.map((item) => {
          const completed = !!item.completedEntry;
          return (
            <div
              key={item.manualKey}
              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition ${
                completed ? "" : themeColors.hoverClass
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {completed ? (
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <Check size={12} />
                  </span>
                ) : (
                  <span
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${themeColors.borderClass}`}
                  >
                    <CheckCircle2 size={12} className="opacity-30" />
                  </span>
                )}
                <span
                  className={`truncate ${completed ? themeColors.secondaryTextClass : themeColors.textClass}`}
                >
                  {item.manualLabel}
                </span>
              </span>
              {completed && item.completedEntry ? (
                <span
                  className={`flex flex-shrink-0 items-center gap-1 text-[11px] ${themeColors.secondaryTextClass}`}
                >
                  <Clock size={11} />
                  {formatTime(item.completedEntry.completedAt)}
                </span>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onCheckIn(item.manualKey)}
                  className={`flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${themeColors.primaryButtonClass}`}
                >
                  打卡
                </motion.button>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default CheckInCard;
