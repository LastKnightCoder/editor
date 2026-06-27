import { useMemo } from "react";
import { motion } from "motion/react";
import {
  Calendar,
  HeartCrack,
  Info,
  Repeat,
  Target,
  Trophy,
} from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import type { BadgeAward, BadgeDefinition, BadgeProgress } from "@/types";
import {
  extractManualKeys,
  formatBadgeRuleText,
  getBadgeProgressValueLabel,
} from "../ruleBuilder";
import { formatPeriodKey, normalizeDesign } from "../components/theme";
import {
  getAwardMilestone,
  getMilestoneDesign,
  getProgressValue,
} from "../components/theme";
import ModalShell from "../components/ModalShell";

export interface BadgeDetailModalProps {
  open: boolean;
  definition: BadgeDefinition | null;
  progress: BadgeProgress | null;
  awards: BadgeAward[];
  onClose: () => void;
}

const policyLabel: Record<string, string> = {
  streak: "连续坚持",
  accumulation: "累计坚持",
  threshold: "达到数量",
};

const scheduleLabel: Record<string, string> = {
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  date_range: "自定义时间段",
  all_time: "全部时间",
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const BadgeDetailModal = ({
  open,
  definition,
  progress,
  awards,
  onClose,
}: BadgeDetailModalProps) => {
  const themeColors = useThemeColors();

  const definitionAwards = useMemo(
    () =>
      awards
        .filter((a) => a.definitionId === definition?.id)
        .sort((a, b) => b.awardedAt - a.awardedAt),
    [awards, definition?.id],
  );

  const manualKeys = useMemo(
    () => (definition ? extractManualKeys(definition.rule) : []),
    [definition],
  );

  if (!definition) return null;

  const successDesign = normalizeDesign(
    definition.successDesign,
    definition.name,
  );
  const failureDesign = definition.failureDesign;
  const isStreak = definition.awardPolicy.type === "streak";
  const target = definition.awardPolicy.target;
  const progressValue = progress ? getProgressValue(definition, progress) : 0;
  const sortedMilestones = [...(definition.milestones ?? [])].sort(
    (a, b) => a.targetValue - b.targetValue,
  );
  const awardedTargets = new Set(
    definitionAwards
      .filter((award) => award.awardKind === "success")
      .map((award) => award.targetValue),
  );

  const infoRows = [
    {
      icon: Repeat,
      label: "周期",
      value:
        scheduleLabel[definition.schedule.type] ?? definition.schedule.type,
    },
    {
      icon: Target,
      label: "颁发策略",
      value: `${policyLabel[definition.awardPolicy.type]} · 目标 ${target}`,
    },
    {
      icon: Info,
      label: "完成条件",
      value: formatBadgeRuleText(definition.rule),
    },
  ];

  if (manualKeys.length > 0) {
    infoRows.push({
      icon: Calendar,
      label: "手动打卡项",
      value: manualKeys.join("、"),
    });
  }

  const progressStats = progress
    ? [
        {
          label: getBadgeProgressValueLabel(definition.rule),
          value: progress.currentValue,
        },
        ...(isStreak
          ? [
              { label: "当前连胜", value: progress.currentStreak },
              { label: "最佳连胜", value: progress.bestStreak },
            ]
          : []),
        { label: "累计", value: progress.accumulatedCount },
      ]
    : [];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={definition.name}
      subtitle={successDesign.description || "徽章详情"}
      widthClass="max-w-2xl"
    >
      <div className="grid gap-6">
        {/* 奖牌展示 */}
        <div className="flex items-center justify-center gap-8 py-2">
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full border-2 shadow-lg"
              style={{
                borderColor: `${successDesign.color}55`,
                background: `conic-gradient(from 210deg, ${successDesign.color}, ${successDesign.color}cc, ${successDesign.color}88, ${successDesign.color})`,
                boxShadow: `inset 0 4px 12px rgba(255,255,255,0.35), 0 8px 24px ${successDesign.color}44`,
              }}
            >
              <span className="text-2xl font-bold text-white drop-shadow">
                {successDesign.icon || <Trophy size={24} />}
              </span>
            </div>
            <span
              className={`text-xs font-medium ${themeColors.activeTextClass}`}
            >
              成功徽章
            </span>
          </div>
          {failureDesign && (
            <div className="flex flex-col items-center gap-2">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full border-2 shadow-lg"
                style={{
                  borderColor: "#7f1d1d55",
                  background:
                    "conic-gradient(from 210deg, #1f2937, #374151, #1f2937)",
                  boxShadow: "inset 0 4px 12px rgba(0,0,0,0.5)",
                }}
              >
                <span className="text-2xl font-bold text-white">
                  <HeartCrack size={24} />
                </span>
              </div>
              <span className="text-xs font-medium text-red-400">失败徽章</span>
            </div>
          )}
        </div>

        {/* 基本信息 */}
        <div
          className={`grid gap-3 rounded-2xl border p-4 ${themeColors.borderClass} ${themeColors.tagBgClass}`}
        >
          {infoRows.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.label} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${themeColors.tagBgClass}`}
                >
                  <Icon size={13} className={themeColors.secondaryTextClass} />
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-xs font-medium uppercase tracking-wider ${themeColors.secondaryTextClass}`}
                  >
                    {row.label}
                  </div>
                  <div
                    className={`mt-0.5 text-sm ${themeColors.activeTextClass}`}
                  >
                    {row.value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 进度统计 */}
        {progressStats.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {progressStats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl border p-3 text-center ${themeColors.borderClass} ${themeColors.cardBgClass}`}
              >
                <div className={`text-xs ${themeColors.secondaryTextClass}`}>
                  {stat.label}
                </div>
                <div
                  className={`mt-1 text-xl font-bold ${themeColors.activeTextClass}`}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {sortedMilestones.length > 1 && (
          <div
            className={`rounded-2xl border p-4 ${themeColors.borderClass} ${themeColors.cardBgClass}`}
          >
            <h3
              className={`mb-3 text-sm font-semibold ${themeColors.activeTextClass}`}
            >
              阶段徽章
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {sortedMilestones.map((milestone) => {
                const design = getMilestoneDesign(
                  milestone,
                  definition.successDesign,
                  definition.name,
                );
                const awarded = awardedTargets.has(milestone.targetValue);
                const active =
                  !awarded &&
                  progressValue < milestone.targetValue &&
                  sortedMilestones.find(
                    (item) => !awardedTargets.has(item.targetValue),
                  )?.id === milestone.id;
                return (
                  <div
                    key={milestone.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                      awarded
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : active
                          ? "border-amber-500/30 bg-amber-500/10"
                          : themeColors.borderClass
                    }`}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: design.color }}
                    >
                      {design.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-sm font-medium ${themeColors.activeTextClass}`}
                      >
                        {milestone.title}
                      </div>
                      <div
                        className={`text-xs ${themeColors.secondaryTextClass}`}
                      >
                        {progressValue}/{milestone.targetValue}
                      </div>
                    </div>
                    <span
                      className={`text-xs ${
                        awarded
                          ? "text-emerald-400"
                          : active
                            ? "text-amber-400"
                            : themeColors.secondaryTextClass
                      }`}
                    >
                      {awarded ? "已获得" : active ? "进行中" : "未达成"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 颁奖历史时间线 */}
        <div>
          <h3
            className={`mb-4 text-sm font-semibold ${themeColors.activeTextClass}`}
          >
            颁奖历史 · {definitionAwards.length}
          </h3>
          {definitionAwards.length === 0 ? (
            <div
              className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${themeColors.borderClass} ${themeColors.secondaryTextClass}`}
            >
              暂无颁奖记录，继续坚持吧。
            </div>
          ) : (
            <div className="relative pl-6">
              {/* 时间线竖线 */}
              <div
                className={`absolute left-2 top-2 bottom-2 w-px ${themeColors.borderClass}`}
                style={{ backgroundColor: "var(--th-border)" }}
              />
              <div className="space-y-4">
                {definitionAwards.map((award, idx) => {
                  const isFailure = award.awardKind === "failure";
                  const milestone = getAwardMilestone(definition, award);
                  return (
                    <motion.div
                      key={award.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="relative flex items-start gap-3"
                    >
                      {/* 节点 */}
                      <div
                        className={`absolute -left-6 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          isFailure
                            ? "border-red-400 bg-red-500/20"
                            : "border-amber-400 bg-amber-500/20"
                        }`}
                      >
                        {isFailure ? (
                          <HeartCrack size={8} className="text-red-400" />
                        ) : (
                          <Trophy size={8} className="text-amber-400" />
                        )}
                      </div>
                      <div
                        className={`flex-1 rounded-2xl border p-3 ${themeColors.borderClass} ${themeColors.cardBgClass}`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-medium ${
                              isFailure ? "text-red-400" : "text-amber-400"
                            }`}
                          >
                            {isFailure ? "未达成" : "已达成"}
                            {milestone ? ` · ${milestone.title}` : ""}
                          </span>
                          <span
                            className={`text-xs ${themeColors.secondaryTextClass}`}
                          >
                            {formatTime(award.awardedAt)}
                          </span>
                        </div>
                        <div
                          className={`mt-1 flex items-center gap-3 text-xs ${themeColors.secondaryTextClass}`}
                        >
                          <span>
                            进度 {award.progressValue}/{award.targetValue}
                          </span>
                          <span>·</span>
                          <span>周期 {formatPeriodKey(award.periodKey)}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

export default BadgeDetailModal;
