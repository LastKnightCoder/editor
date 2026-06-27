import { useMemo } from "react";
import { Plus, Trash2, X } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import type { BadgeRuleOperator } from "@/types";
import {
  badgeConditionSources,
  comparatorOptions,
  createConditionDraft,
  type BadgeConditionDraft,
  type BadgeConditionSource,
  type BadgeRuleDraft,
} from "../ruleBuilder";
import { useBadgeSelectClass } from "./useInputClass";
import BadgeSelect from "./BadgeSelect";
import Button from "./Button";

const operatorLabel: Record<BadgeRuleOperator, string> = {
  all: "全部满足",
  any: "任一满足",
};

const sourceSelectOptions = badgeConditionSources.map((source) => ({
  value: source.value,
  label: `${source.kind} · ${source.label}`,
}));

const updateRuleDraft = (
  draft: BadgeRuleDraft,
  updater: (next: BadgeRuleDraft) => void,
): BadgeRuleDraft => {
  const next: BadgeRuleDraft = {
    ...draft,
    groups: draft.groups.map((group) => ({
      ...group,
      conditions: group.conditions.map((condition) => ({ ...condition })),
    })),
  };
  updater(next);
  return next;
};

interface ConditionRowProps {
  condition: BadgeConditionDraft;
  canRemove: boolean;
  onChange: (condition: BadgeConditionDraft) => void;
  onRemove: () => void;
}

const ConditionRow = ({
  condition,
  canRemove,
  onChange,
  onRemove,
}: ConditionRowProps) => {
  const selectClass = useBadgeSelectClass();
  return (
    <div className="grid gap-3 rounded-2xl border border-dashed p-3 sm:grid-cols-[minmax(180px,1.5fr)_120px_96px_auto]">
      <BadgeSelect
        value={condition.source}
        options={sourceSelectOptions}
        onChange={(value) =>
          onChange({ ...condition, source: value as BadgeConditionSource })
        }
      />
      <BadgeSelect
        value={condition.comparator}
        options={comparatorOptions}
        onChange={(value) =>
          onChange({
            ...condition,
            comparator: value as BadgeConditionDraft["comparator"],
          })
        }
      />
      <input
        className={`${selectClass} px-3 py-2`}
        min={1}
        type="number"
        value={condition.target}
        onChange={(event) =>
          onChange({
            ...condition,
            target: Number(event.target.value),
          })
        }
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={!canRemove}
        onClick={onRemove}
        className="px-2"
      >
        <Trash2 size={14} />
      </Button>
      {condition.source === "manual:custom" && (
        <input
          className={`${selectClass} sm:col-span-4`}
          value={condition.customManualKey ?? ""}
          placeholder="自定义打卡标识，例如 sleep_early"
          onChange={(event) =>
            onChange({
              ...condition,
              customManualKey: event.target.value,
            })
          }
        />
      )}
    </div>
  );
};

export interface RuleBuilderProps {
  draft: BadgeRuleDraft;
  advanced: boolean;
  onChange: (draft: BadgeRuleDraft) => void;
}

const RuleBuilder = ({ draft, advanced, onChange }: RuleBuilderProps) => {
  const themeColors = useThemeColors();
  const nextId = useMemo(() => {
    const ids = draft.groups.flatMap((group) => [
      group.id,
      ...group.conditions.map((condition) => condition.id),
    ]);
    return ids.length + 1;
  }, [draft]);

  // 简单模式：只暴露第一个条件组的第一个条件
  if (!advanced) {
    const firstGroup = draft.groups[0];
    const firstCondition = firstGroup?.conditions[0];
    if (!firstCondition) return null;

    return (
      <ConditionRow
        condition={firstCondition}
        canRemove={false}
        onChange={(changed) =>
          onChange(
            updateRuleDraft(draft, (next) => {
              next.groups[0].conditions[0] = changed;
            }),
          )
        }
        onRemove={() => undefined}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-3 ${themeColors.borderClass}`}
      >
        <div>
          <div className={`text-sm font-medium ${themeColors.activeTextClass}`}>
            多组条件之间
          </div>
          <div className={`mt-0.5 text-xs ${themeColors.secondaryTextClass}`}>
            组之间组合，组内放条件。
          </div>
        </div>
        <div
          className={`flex rounded-full border p-1 ${themeColors.borderClass} ${themeColors.tagBgClass}`}
        >
          {(["all", "any"] as BadgeRuleOperator[]).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => onChange({ ...draft, topOp: op })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                draft.topOp === op
                  ? themeColors.primaryButtonClass
                  : themeColors.textClass
              }`}
            >
              {op === "all" ? "全部组达成" : "任一组达成"}
            </button>
          ))}
        </div>
      </div>

      {draft.groups.map((group, groupIndex) => (
        <div
          key={group.id}
          className={`grid gap-3 rounded-2xl border border-dashed p-4 ${themeColors.borderClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${themeColors.primaryButtonClass}`}
              >
                {groupIndex + 1}
              </div>
              <div>
                <div
                  className={`text-sm font-semibold ${themeColors.activeTextClass}`}
                >
                  条件组
                </div>
                <div className={`text-xs ${themeColors.secondaryTextClass}`}>
                  组内条件需要{operatorLabel[group.op]}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`flex rounded-full border p-1 ${themeColors.borderClass} ${themeColors.tagBgClass}`}
              >
                {(["all", "any"] as BadgeRuleOperator[]).map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() =>
                      onChange(
                        updateRuleDraft(draft, (next) => {
                          next.groups[groupIndex].op = op;
                        }),
                      )
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      group.op === op
                        ? themeColors.primaryButtonClass
                        : themeColors.textClass
                    }`}
                  >
                    {operatorLabel[op]}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={draft.groups.length === 1}
                onClick={() =>
                  onChange(
                    updateRuleDraft(draft, (next) => {
                      next.groups.splice(groupIndex, 1);
                    }),
                  )
                }
                className="px-2"
              >
                <X size={14} />
              </Button>
            </div>
          </div>

          {group.conditions.map((condition, conditionIndex) => (
            <ConditionRow
              key={condition.id}
              condition={condition}
              canRemove={group.conditions.length > 1}
              onChange={(changed) =>
                onChange(
                  updateRuleDraft(draft, (next) => {
                    next.groups[groupIndex].conditions[conditionIndex] =
                      changed;
                  }),
                )
              }
              onRemove={() =>
                onChange(
                  updateRuleDraft(draft, (next) => {
                    next.groups[groupIndex].conditions.splice(
                      conditionIndex,
                      1,
                    );
                  }),
                )
              }
            />
          ))}

          <Button
            size="sm"
            onClick={() =>
              onChange(
                updateRuleDraft(draft, (next) => {
                  next.groups[groupIndex].conditions.push(
                    createConditionDraft(`condition-${nextId}`),
                  );
                }),
              )
            }
          >
            <Plus size={14} />
            添加条件
          </Button>
        </div>
      ))}

      <Button
        size="sm"
        onClick={() =>
          onChange({
            ...draft,
            groups: [
              ...draft.groups,
              {
                id: `group-${nextId}`,
                op: "all",
                conditions: [createConditionDraft(`condition-${nextId + 1}`)],
              },
            ],
          })
        }
      >
        <Plus size={14} />
        添加条件组
      </Button>
    </div>
  );
};

export default RuleBuilder;
