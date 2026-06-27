import type {
  BadgeAward,
  BadgeDefinition,
  BadgeDesign,
  BadgeMilestone,
  BadgeProgress,
} from "@/types";

export const badgeColorPalette: string[] = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#db2777",
  "#0891b2",
  "#dc2626",
  "#4f46e5",
  "#16a34a",
  "#ea580c",
];

// 失败徽章专属调色板：偏暗、克制的色调，贴合「失败」语义
export const badgeFailureColorPalette: string[] = [
  "#7f1d1d",
  "#991b1b",
  "#78350f",
  "#3f3f46",
  "#1f2937",
  "#44403c",
  "#581c87",
  "#166534",
  "#0c4a6e",
  "#4a044e",
];

export const badgeDefaultFailureColor = "#7f1d1d";

export const badgeEmojiOptions: string[] = [
  "★",
  "✦",
  "🏆",
  "🔥",
  "🎯",
  "📚",
  "✍️",
  "🏃",
  "🥗",
  "💪",
  "🧘",
  "⏰",
  "💎",
  "🚀",
  "🌟",
  "❤️",
];

export function getDesign(
  definition: BadgeDefinition,
  awardKind: "success" | "failure",
): BadgeDesign | null | undefined {
  return awardKind === "failure"
    ? definition.failureDesign
    : definition.successDesign;
}

export function normalizeDesign(
  design: BadgeDesign | null | undefined,
  fallbackTitle: string,
): Required<BadgeDesign> {
  return {
    title: design?.title ?? fallbackTitle,
    description: design?.description ?? "",
    icon: design?.icon ?? "★",
    imageUrl: design?.imageUrl ?? "",
    color: design?.color ?? "#2563eb",
  };
}

export function getProgressValue(
  definition: BadgeDefinition,
  progress: BadgeProgress,
): number {
  if (definition.awardPolicy.type === "streak") return progress.currentStreak;
  if (definition.awardPolicy.type === "accumulation") {
    return progress.accumulatedCount;
  }
  return progress.currentValue;
}

export function getAwardMilestone(
  definition: BadgeDefinition | undefined,
  award: BadgeAward,
): BadgeMilestone | null {
  const milestones = definition?.milestones ?? [];
  return (
    milestones.find((milestone) => milestone.id === award.milestoneId) ??
    milestones.find(
      (milestone) => milestone.targetValue === award.targetValue,
    ) ??
    null
  );
}

export function getMilestoneDesign(
  milestone: BadgeMilestone | null | undefined,
  fallback: BadgeDesign | null | undefined,
  fallbackTitle: string,
): Required<BadgeDesign> {
  return normalizeDesign(
    milestone
      ? {
          title: milestone.title,
          description: milestone.description ?? fallback?.description,
          icon: milestone.icon ?? fallback?.icon,
          color: milestone.color ?? fallback?.color,
          imageUrl: fallback?.imageUrl,
        }
      : fallback,
    fallbackTitle,
  );
}

export function getAwardDesign(
  definition: BadgeDefinition | undefined,
  award: BadgeAward,
): Required<BadgeDesign> {
  if (award.awardKind === "failure") {
    return normalizeDesign(
      definition?.failureDesign,
      definition?.name ?? "徽章",
    );
  }
  const milestone = getAwardMilestone(definition, award);
  return getMilestoneDesign(
    milestone,
    definition?.successDesign,
    definition?.name ?? "徽章",
  );
}

export function getNextMilestone(
  definition: BadgeDefinition,
  awards: BadgeAward[] = [],
): BadgeMilestone | null {
  const milestones = [...(definition.milestones ?? [])].sort(
    (a, b) => a.targetValue - b.targetValue,
  );
  if (milestones.length === 0) return null;

  const awardedTargets = new Set(
    awards
      .filter(
        (award) =>
          award.definitionId === definition.id && award.awardKind === "success",
      )
      .map((award) => award.targetValue),
  );
  return (
    milestones.find(
      (milestone) => !awardedTargets.has(milestone.targetValue),
    ) ?? milestones[milestones.length - 1]
  );
}

export function formatPeriodKey(periodKey: string): string {
  if (periodKey === "all") return "全程";
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return periodKey.slice(5);
  if (/^\d{4}-W\d{2}$/.test(periodKey)) return periodKey;
  if (/^\d{4}-\d{2}$/.test(periodKey)) return periodKey;
  return periodKey;
}

export function isCustomIcon(icon: string): boolean {
  return icon.length === 1 || icon.length > 2;
}
