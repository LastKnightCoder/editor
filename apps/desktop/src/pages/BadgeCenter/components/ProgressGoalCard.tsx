import { motion } from "motion/react";
import { Archive, Flame, Pencil, Target } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import type { BadgeAward, BadgeDefinition, BadgeProgress } from "@/types";
import { getNextMilestone, getProgressValue, normalizeDesign } from "./theme";

export interface ProgressGoalCardProps {
  definition: BadgeDefinition;
  progress: BadgeProgress;
  awards?: BadgeAward[];
  index?: number;
  onEdit?: (definition: BadgeDefinition) => void;
  onArchive?: (definition: BadgeDefinition) => void;
  onClick?: (definition: BadgeDefinition) => void;
}

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const policyLabel: Record<string, string> = {
  streak: "连续坚持",
  accumulation: "累计坚持",
  threshold: "达到数量",
};

const ProgressGoalCard = ({
  definition,
  progress,
  awards = [],
  index = 0,
  onEdit,
  onArchive,
  onClick,
}: ProgressGoalCardProps) => {
  const themeColors = useThemeColors();
  const design = normalizeDesign(definition.successDesign, definition.name);
  const nextMilestone = getNextMilestone(definition, awards);
  const target = nextMilestone?.targetValue ?? definition.awardPolicy.target;
  const isStreak = definition.awardPolicy.type === "streak";
  const value = getProgressValue(definition, progress);
  const ratio = Math.min(1, target > 0 ? value / target : 0);
  const dashOffset = CIRCUMFERENCE * (1 - ratio);
  const targetLabel = nextMilestone
    ? `下一阶段 ${nextMilestone.targetValue}`
    : `目标 ${target}`;

  const completed = value >= target;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.05,
        type: "spring",
        stiffness: 240,
        damping: 24,
      }}
      className={`group relative flex gap-5 rounded-3xl border p-5 backdrop-blur transition ${themeColors.cardBorderClass} ${themeColors.cardBgClass} ${themeColors.hoverBorderClass} ${onClick ? "cursor-pointer" : ""}`}
      onClick={() => onClick?.(definition)}
    >
      {/* 进度环 */}
      <div className="relative h-24 w-24 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            className={themeColors.tagBgClass}
            stroke="currentColor"
          />
          <motion.circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke={completed ? "#22c55e" : design.color}
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-lg font-bold ${themeColors.activeTextClass}`}>
            {value}
          </span>
          <span className={`text-[10px] ${themeColors.secondaryTextClass}`}>
            / {target}
          </span>
        </div>
      </div>

      {/* 信息 */}
      <div className="min-w-0 flex-1 pr-12">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
            style={{
              backgroundColor: `${design.color}22`,
              color: design.color,
            }}
          >
            {design.icon}
          </span>
          <h3
            className={`truncate text-base font-semibold ${themeColors.activeTextClass}`}
          >
            {definition.name}
          </h3>
        </div>

        <div className={`mt-1 text-xs ${themeColors.secondaryTextClass}`}>
          {policyLabel[definition.awardPolicy.type]} ·{" "}
          {definition.source === "system" ? "系统" : "自定义"}
        </div>
        <div
          className={`mt-1 max-w-full truncate text-xs ${themeColors.secondaryTextClass}`}
          title={targetLabel}
        >
          {targetLabel}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {isStreak && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                progress.currentStreak > 0
                  ? "bg-orange-500/15 text-orange-400"
                  : themeColors.tagBgClass
              }`}
            >
              <Flame size={12} />
              当前 {progress.currentStreak}
            </span>
          )}
          {isStreak && progress.bestStreak > 0 && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${themeColors.tagBgClass} ${themeColors.textClass}`}
            >
              最佳 {progress.bestStreak}
            </span>
          )}
          {definition.awardPolicy.type === "accumulation" && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${themeColors.tagBgClass} ${themeColors.textClass}`}
            >
              累计 {progress.accumulatedCount}
            </span>
          )}
          {completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-400">
              <Target size={12} /> 已达标
            </span>
          )}
        </div>
      </div>

      {/* 操作按钮（hover 显示，系统徽章只读） */}
      {(onEdit || onArchive) && definition.source !== "system" && (
        <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              title="编辑"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(definition);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition ${themeColors.tagBgClass} ${themeColors.textClass} ${themeColors.hoverClass}`}
            >
              <Pencil size={13} />
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              title="归档"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(definition);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition ${themeColors.tagBgClass} text-red-400 hover:bg-red-500/15`}
            >
              <Archive size={13} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default ProgressGoalCard;
