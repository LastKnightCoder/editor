import React from "react";
import classNames from "classnames";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  Check,
  Circle,
  Flame,
  Target,
  Trophy,
} from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { getBadgeDashboard, evaluateAllBadges } from "@/commands/badge";
import type { BadgeDefinition, BadgeManualEntry, BadgeProgress } from "@/types";
import {
  getNextMilestone,
  getProgressValue,
  normalizeDesign,
} from "@/pages/BadgeCenter/components/theme";
import { extractManualKeys } from "@/pages/BadgeCenter/ruleBuilder";

const BADGE_QUERY_KEY = ["home", "badge"] as const;
const PREVIEW_LIMIT = 4;
const EMPTY_STRING_SET: Set<string> = new Set();

const policyLabel: Record<string, string> = {
  streak: "连续坚持",
  accumulation: "累计坚持",
  threshold: "达到数量",
};

interface ActiveGoal {
  definition: BadgeDefinition;
  progress: BadgeProgress;
}

const getGoalValue = (
  definition: BadgeDefinition,
  progress: BadgeProgress,
): number => {
  return getProgressValue(definition, progress);
};

interface GoalRowProps {
  goal: ActiveGoal;
  manualKeys: string[];
  todayCompletedKeys: Set<string>;
  onOpen: (definition: BadgeDefinition) => void;
}

const GoalRow: React.FC<GoalRowProps> = ({
  goal,
  manualKeys,
  todayCompletedKeys,
  onOpen,
}) => {
  const themeColors = useThemeColors();
  const { definition, progress } = goal;
  const design = normalizeDesign(definition.successDesign, definition.name);
  const nextMilestone = getNextMilestone(definition);
  const target = nextMilestone?.targetValue ?? definition.awardPolicy.target;
  const value = getGoalValue(definition, progress);
  const completed = value >= target;

  // 今日打卡情况：手动打卡项才需要展示
  const hasManual = manualKeys.length > 0;
  const todayDoneCount = hasManual
    ? manualKeys.filter((k) => todayCompletedKeys.has(k)).length
    : 0;
  const allCheckedIn = hasManual && todayDoneCount === manualKeys.length;

  return (
    <button
      type="button"
      onClick={() => onOpen(definition)}
      className={classNames(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        themeColors.hoverClass,
      )}
    >
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
        style={{ backgroundColor: `${design.color}22`, color: design.color }}
      >
        {design.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={classNames(
            "block truncate text-xs font-medium",
            themeColors.textClass,
          )}
        >
          {definition.name}
        </span>
        <span
          className={classNames(
            "mt-0.5 flex items-center gap-1 text-[10px]",
            themeColors.secondaryTextClass,
          )}
        >
          <span>{policyLabel[definition.awardPolicy.type]}</span>
          {nextMilestone && (
            <>
              <span className="opacity-40">·</span>
              <span>{nextMilestone.title}</span>
            </>
          )}
          {hasManual && (
            <>
              <span className="opacity-40">·</span>
              <span
                className={classNames(
                  "inline-flex items-center gap-0.5",
                  allCheckedIn ? "text-emerald-400" : "",
                )}
              >
                {allCheckedIn ? (
                  <>
                    <Check size={10} /> 今日已打卡
                  </>
                ) : (
                  <>
                    <Circle size={8} className="fill-current" />
                    今日 {todayDoneCount}/{manualKeys.length}
                  </>
                )}
              </span>
            </>
          )}
        </span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-1.5">
        {definition.awardPolicy.type === "streak" &&
          progress.currentStreak > 0 && (
            <Flame size={11} className="text-orange-400" />
          )}
        {completed ? (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-400">
            <Target size={11} /> 达标
          </span>
        ) : (
          <span
            className={classNames(
              "text-[11px] font-semibold",
              themeColors.activeTextClass,
            )}
          >
            {value}
            <span className={themeColors.secondaryTextClass}>/{target}</span>
          </span>
        )}
      </span>
    </button>
  );
};

const BadgePanel: React.FC = () => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();

  const { data } = useQuery({
    queryKey: BADGE_QUERY_KEY,
    queryFn: async () => {
      await evaluateAllBadges();
      return getBadgeDashboard();
    },
    staleTime: 60 * 1000,
  });

  const definitions = React.useMemo(
    () => data?.definitions ?? [],
    [data?.definitions],
  );
  const progress = React.useMemo(() => data?.progress ?? [], [data?.progress]);
  const todayManualEntries = React.useMemo(
    () => data?.todayManualEntries ?? [],
    [data?.todayManualEntries],
  );

  // 今日打卡查询表：definitionId -> Set<manualKey>
  const todayCheckInMap = React.useMemo(() => {
    const m = new Map<number, Set<string>>();
    todayManualEntries.forEach((entry: BadgeManualEntry) => {
      let set = m.get(entry.definitionId);
      if (!set) {
        set = new Set();
        m.set(entry.definitionId, set);
      }
      set.add(entry.manualKey);
    });
    return m;
  }, [todayManualEntries]);

  // 各进行中目标的手动打卡项（definitionId -> manualKeys）
  const goalManualKeysMap = React.useMemo(() => {
    const m = new Map<number, string[]>();
    definitions.forEach((d) => {
      const keys = extractManualKeys(d.rule);
      if (keys.length > 0) m.set(d.id, keys);
    });
    return m;
  }, [definitions]);

  // 进行中目标：与徽章中心统计规则一致——排除系统徽章，且必须有对应进度
  const activeGoals = React.useMemo<ActiveGoal[]>(() => {
    const progressMap = new Map<number, BadgeProgress>();
    progress.forEach((p) => progressMap.set(p.definitionId, p));
    return definitions
      .filter((d) => d.status === "active" && d.source !== "system")
      .map((definition) => {
        const p = progressMap.get(definition.id);
        return p ? { definition, progress: p } : null;
      })
      .filter((item): item is ActiveGoal => item !== null);
  }, [definitions, progress]);

  const stats = React.useMemo(() => {
    const awards = data?.awards ?? [];
    const maxStreak = progress.reduce((mx, p) => Math.max(mx, p.bestStreak), 0);
    return {
      success: awards.filter((a) => a.awardKind === "success").length,
      maxStreak,
      activeGoals: activeGoals.length,
    };
  }, [data?.awards, progress, activeGoals]);

  const previewGoals = React.useMemo(
    () => activeGoals.slice(0, PREVIEW_LIMIT),
    [activeGoals],
  );

  const handleOpenBadgeCenter = React.useCallback(() => {
    createTab(TabType.BadgeCenter);
  }, [createTab]);

  if (activeGoals.length === 0) {
    return (
      <div
        className={classNames(
          "flex min-h-[180px] flex-col rounded-xl border p-4",
          themeColors.cardBorderClass,
          themeColors.cardBgClass,
        )}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <div
            className={classNames(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              themeColors.iconBgClass,
            )}
          >
            <Award
              className={classNames("h-4 w-4", themeColors.iconTextClass)}
            />
          </div>
          <h3
            className={classNames(
              "text-sm font-semibold",
              themeColors.textClass,
            )}
          >
            徽章
          </h3>
        </div>
        <button
          type="button"
          onClick={handleOpenBadgeCenter}
          className={classNames(
            "flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg text-xs transition-colors",
            themeColors.hoverClass,
            themeColors.secondaryTextClass,
          )}
        >
          <Trophy size={20} className="opacity-40" />
          <span>还没有进行中的目标，去创建第一个</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "flex min-h-[180px] flex-col rounded-xl border p-4",
        themeColors.cardBorderClass,
        themeColors.cardBgClass,
      )}
    >
      {/* 标题行 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={classNames(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              themeColors.iconBgClass,
            )}
          >
            <Award
              className={classNames("h-4 w-4", themeColors.iconTextClass)}
            />
          </div>
          <h3
            className={classNames(
              "text-sm font-semibold",
              themeColors.textClass,
            )}
          >
            进行中的目标
          </h3>
          {stats.activeGoals > 0 && (
            <span
              className={classNames(
                "rounded-full px-1.5 py-0.5 text-xs font-medium",
                themeColors.badgeBgClass,
                themeColors.badgeTextClass,
              )}
            >
              {stats.activeGoals}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleOpenBadgeCenter}
          className={classNames(
            "flex cursor-pointer items-center gap-1 text-xs transition-colors",
            themeColors.secondaryTextClass,
            "hover:opacity-80",
          )}
        >
          徽章中心
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* 统计条 */}
      <div className="mb-2 flex items-center gap-3 text-xs">
        <span
          className={classNames(
            "inline-flex items-center gap-1",
            themeColors.secondaryTextClass,
          )}
        >
          <Trophy size={12} className="text-amber-400" />
          {stats.success}
        </span>
        {stats.maxStreak > 0 && (
          <span className="inline-flex items-center gap-1 text-orange-400">
            <Flame size={12} />
            最长 {stats.maxStreak} 连
          </span>
        )}
      </div>

      {/* 进行中目标列表 */}
      <div className="flex flex-1 flex-col gap-0.5">
        {previewGoals.map((goal) => (
          <GoalRow
            key={goal.definition.id}
            goal={goal}
            manualKeys={goalManualKeysMap.get(goal.definition.id) ?? []}
            todayCompletedKeys={
              todayCheckInMap.get(goal.definition.id) ?? EMPTY_STRING_SET
            }
            onOpen={handleOpenBadgeCenter}
          />
        ))}
        {activeGoals.length > PREVIEW_LIMIT && (
          <button
            type="button"
            onClick={handleOpenBadgeCenter}
            className={classNames(
              "mt-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition-colors",
              themeColors.hoverClass,
              themeColors.secondaryTextClass,
            )}
          >
            查看全部 {activeGoals.length} 个
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export default BadgePanel;
