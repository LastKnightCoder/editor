import { Plus, Sparkles, Trash2 } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import {
  commonMilestoneTargets,
  createMilestoneDraft,
  normalizeMilestoneDrafts,
  type BadgeMilestoneDraft,
} from "../ruleBuilder";
import Button from "./Button";
import { useBadgeInputClass } from "./useInputClass";

interface MilestoneManagerProps {
  milestones: BadgeMilestoneDraft[];
  badgeName: string;
  finalTarget: number;
  onChange: (milestones: BadgeMilestoneDraft[]) => void;
}

const makeMilestoneId = () =>
  `milestone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildTitle = (badgeName: string, targetValue: number) => {
  const name = badgeName.trim();
  return name ? `${name} ${targetValue}` : `${targetValue}`;
};

const MilestoneManager = ({
  milestones,
  badgeName,
  finalTarget,
  onChange,
}: MilestoneManagerProps) => {
  const themeColors = useThemeColors();
  const inputClass = useBadgeInputClass();
  const normalizedFinalTarget = Math.max(
    1,
    Math.floor(Number(finalTarget) || 1),
  );
  const normalizedMilestones = normalizeMilestoneDrafts(milestones);
  const duplicateTargets = new Set<number>();
  const seenTargets = new Set<number>();

  milestones.forEach((milestone) => {
    const targetValue = Math.floor(Number(milestone.targetValue));
    if (!Number.isFinite(targetValue) || targetValue <= 0) return;
    if (seenTargets.has(targetValue)) {
      duplicateTargets.add(targetValue);
    }
    seenTargets.add(targetValue);
  });

  const updateMilestone = (
    index: number,
    patch: Partial<BadgeMilestoneDraft>,
  ) => {
    onChange(
      milestones.map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, ...patch } : milestone,
      ),
    );
  };

  const addMilestone = () => {
    const availableCommonTarget = commonMilestoneTargets.find(
      (target) => target < normalizedFinalTarget && !seenTargets.has(target),
    );
    const currentMax = normalizedMilestones.at(-1)?.targetValue ?? 0;
    const fallbackTarget =
      currentMax + 1 < normalizedFinalTarget
        ? currentMax + 1
        : Math.max(1, normalizedFinalTarget - 1);
    const nextTarget =
      availableCommonTarget && !seenTargets.has(availableCommonTarget)
        ? availableCommonTarget
        : fallbackTarget;
    onChange([
      ...milestones,
      createMilestoneDraft(
        nextTarget,
        makeMilestoneId(),
        buildTitle(badgeName, nextTarget),
      ),
    ]);
  };

  const applyCommonMilestones = () => {
    onChange(
      commonMilestoneTargets
        .filter((target) => target < normalizedFinalTarget)
        .map((target) =>
          createMilestoneDraft(
            target,
            `milestone-${target}`,
            buildTitle(badgeName, target),
          ),
        ),
    );
  };

  const removeMilestone = (index: number) => {
    onChange(
      milestones.filter((_, milestoneIndex) => milestoneIndex !== index),
    );
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            className={`m-0 text-sm font-semibold ${themeColors.activeTextClass}`}
          >
            阶段徽章
          </h3>
          <p className={`mt-1 text-xs ${themeColors.secondaryTextClass}`}>
            可选。阶段必须小于总目标，达到阶段时分别颁发徽章。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={applyCommonMilestones}>
            <Sparkles size={14} />
            常用阶段
          </Button>
          <Button variant="secondary" size="sm" onClick={addMilestone}>
            <Plus size={14} />
            添加阶段
          </Button>
        </div>
      </div>

      <div
        className={`grid gap-2 rounded-2xl border border-dashed p-3 ${themeColors.borderClass}`}
      >
        {milestones.length === 0 && (
          <div
            className={`rounded-xl px-3 py-4 text-sm ${themeColors.tagBgClass} ${themeColors.secondaryTextClass}`}
          >
            尚未设置阶段徽章，达成总目标时仍会颁发徽章。
          </div>
        )}
        {milestones.map((milestone, index) => {
          const targetValue = Math.floor(Number(milestone.targetValue));
          const invalidTarget =
            !Number.isFinite(targetValue) || targetValue <= 0;
          const duplicated =
            Number.isFinite(targetValue) && duplicateTargets.has(targetValue);
          const reachesFinalTarget =
            Number.isFinite(targetValue) &&
            targetValue >= normalizedFinalTarget;

          return (
            <div
              key={milestone.id}
              className="grid gap-2 rounded-xl border border-transparent p-2 sm:grid-cols-[120px_minmax(180px,1fr)_auto]"
            >
              <div className="grid gap-1">
                <span
                  className={`text-[11px] font-medium ${themeColors.secondaryTextClass}`}
                >
                  目标值
                </span>
                <input
                  className={`${inputClass} px-3 py-2`}
                  min={1}
                  max={Math.max(1, normalizedFinalTarget - 1)}
                  type="number"
                  value={milestone.targetValue}
                  onChange={(event) =>
                    updateMilestone(index, {
                      targetValue: Number(event.target.value),
                    })
                  }
                />
              </div>

              <div className="grid gap-1">
                <span
                  className={`text-[11px] font-medium ${themeColors.secondaryTextClass}`}
                >
                  显示名称
                </span>
                <input
                  className={`${inputClass} px-3 py-2`}
                  value={milestone.title}
                  placeholder={buildTitle(
                    badgeName,
                    Number.isFinite(targetValue) && targetValue > 0
                      ? targetValue
                      : 1,
                  )}
                  onChange={(event) =>
                    updateMilestone(index, { title: event.target.value })
                  }
                />
              </div>

              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMilestone(index)}
                  className="h-10 w-10 px-0"
                  title="删除阶段"
                >
                  <Trash2 size={14} />
                </Button>
              </div>

              {(invalidTarget || duplicated || reachesFinalTarget) && (
                <div className="text-xs text-red-400 sm:col-span-3">
                  {invalidTarget
                    ? "阶段目标必须是大于 0 的整数。"
                    : duplicated
                      ? "这个阶段目标已经存在，请换一个数值。"
                      : "阶段目标必须小于总目标。"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MilestoneManager;
