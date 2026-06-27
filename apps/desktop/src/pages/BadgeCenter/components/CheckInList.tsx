import { useMemo } from "react";
import { CalendarCheck } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import type { BadgeDefinition, BadgeManualEntry } from "@/types";
import { extractManualKeys } from "../ruleBuilder";
import { badgeConditionSources } from "../ruleBuilder";
import CheckInCard, { type CheckInManualItem } from "./CheckInCard";

export interface ManualItem {
  definition: BadgeDefinition;
  manualKey: string;
}

export interface CheckInListProps {
  definitions: BadgeDefinition[];
  todayManualEntries: BadgeManualEntry[];
  onCheckIn: (item: ManualItem) => void;
}

const getManualLabel = (manualKey: string) => {
  const source = badgeConditionSources.find(
    (item) => item.value === `manual:${manualKey}`,
  );
  return source?.label.replace("手动打卡：", "") ?? manualKey;
};

const CheckInList = ({
  definitions,
  todayManualEntries,
  onCheckIn,
}: CheckInListProps) => {
  const themeColors = useThemeColors();

  // 按徽章聚合：每个定义 1 个卡片，包含其所有手动打卡项
  const goalCards = useMemo(() => {
    const entryMap = new Map<string, BadgeManualEntry>();
    todayManualEntries.forEach((entry) => {
      entryMap.set(`${entry.definitionId}:${entry.manualKey}`, entry);
    });

    return definitions
      .map((definition) => {
        const manualKeys = extractManualKeys(definition.rule);
        if (manualKeys.length === 0) return null;

        const manualItems: CheckInManualItem[] = manualKeys.map(
          (manualKey) => ({
            manualKey,
            manualLabel: getManualLabel(manualKey),
            completedEntry: entryMap.get(`${definition.id}:${manualKey}`),
          }),
        );

        return { definition, manualItems };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [definitions, todayManualEntries]);

  if (goalCards.length === 0) return null;

  const completedCount = goalCards.filter((card) =>
    card.manualItems.every((item) => !!item.completedEntry),
  ).length;

  return (
    <section
      className={`rounded-3xl border p-6 backdrop-blur ${themeColors.cardBorderClass} ${themeColors.cardBgClass}`}
    >
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full ${themeColors.tagBgClass}`}
          >
            <CalendarCheck size={17} className={themeColors.activeTextClass} />
          </div>
          <div>
            <h2
              className={`m-0 text-lg font-semibold ${themeColors.activeTextClass}`}
            >
              今日打卡
            </h2>
            <p className={`mt-0.5 text-xs ${themeColors.secondaryTextClass}`}>
              {completedCount}/{goalCards.length} 已完成 · 每日坚持，成就习惯
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {goalCards.map((card, idx) => (
          <CheckInCard
            key={card.definition.id}
            definitionId={card.definition.id}
            definitionName={card.definition.name}
            manualItems={card.manualItems}
            onCheckIn={(manualKey) =>
              onCheckIn({ definition: card.definition, manualKey })
            }
            index={idx}
          />
        ))}
      </div>
    </section>
  );
};

export default CheckInList;
