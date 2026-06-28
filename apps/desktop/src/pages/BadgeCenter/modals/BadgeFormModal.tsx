import { useEffect, useMemo, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { App } from "antd";
import useThemeColors from "@/hooks/useThemeColors";
import DatePicker from "@/components/DatePicker";
import type {
  BadgeDefinition,
  CreateBadgeDefinitionInput,
  UpdateBadgeDefinitionInput,
} from "@/types";
import { createBadgeDefinition, updateBadgeDefinition } from "@/commands/badge";
import {
  awardOptions,
  badgeConditionSources,
  buildBadgeRule,
  createRuleDraft,
  definitionToDraft,
  hasAggregateCondition,
  normalizeMilestoneDrafts,
  scheduleOptions,
  validateMilestoneTargets,
  type BadgeCreateDraft,
} from "../ruleBuilder";
import ModalShell from "../components/ModalShell";
import Button from "../components/Button";
import Field from "../components/Field";
import Toggle from "../components/Toggle";
import BadgeSelect from "../components/BadgeSelect";
import BadgePreview from "../components/BadgePreview";
import RuleBuilder from "../components/RuleBuilder";
import MilestoneManager from "../components/MilestoneManager";
import {
  badgeColorPalette,
  badgeFailureColorPalette,
  badgeDefaultFailureColor,
  badgeEmojiOptions,
} from "../components/theme";
import { useBadgeInputClass } from "../components/useInputClass";

const defaultDraft = (): BadgeCreateDraft => ({
  name: "",
  description: "",
  icon: badgeEmojiOptions[0],
  color: badgeColorPalette[0],
  failureColor: badgeFailureColorPalette[0],
  ruleDraft: createRuleDraft(),
  scheduleType: "daily",
  rangeStart: "",
  rangeEnd: "",
  awardType: "streak",
  target: 7,
  openEnded: false,
  milestones: [],
  failureEnabled: false,
  graceDays: 1,
});

export interface BadgeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  editingDefinition?: BadgeDefinition | null;
}

const BadgeFormModal = ({
  open,
  onClose,
  onSaved,
  editingDefinition = null,
}: BadgeFormModalProps) => {
  const themeColors = useThemeColors();
  const { message } = App.useApp();
  const inputClass = useBadgeInputClass();

  const isEditing = !!editingDefinition;
  const ruleLocked =
    isEditing &&
    !!editingDefinition &&
    hasAggregateCondition(editingDefinition.rule);

  const [draft, setDraft] = useState<BadgeCreateDraft>(() => defaultDraft());
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editingDefinition) {
      setDraft(definitionToDraft(editingDefinition));
      setAdvanced(hasAggregateCondition(editingDefinition.rule));
    } else {
      setDraft(defaultDraft());
      setAdvanced(false);
    }
    setError("");
  }, [open, editingDefinition]);

  const manualLabel = useMemo(() => {
    const first = draft.ruleDraft.groups[0]?.conditions[0];
    if (!first) return "";
    const src = badgeConditionSources.find((s) => s.value === first.source);
    return src?.label ?? "";
  }, [draft.ruleDraft]);

  const handleSubmit = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("请先填写徽章名称");
      return;
    }
    if (draft.scheduleType === "date_range") {
      if (!draft.rangeStart || !draft.rangeEnd) {
        setError("请选择时间段的起止日期");
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const rule =
        ruleLocked && editingDefinition
          ? editingDefinition.rule
          : buildBadgeRule(draft.ruleDraft);
      const schedule =
        draft.scheduleType === "date_range"
          ? {
              type: "date_range" as const,
              startDate: draft.rangeStart
                ? new Date(draft.rangeStart).getTime()
                : undefined,
              endDate: draft.rangeEnd
                ? new Date(draft.rangeEnd).getTime() + 24 * 60 * 60 * 1000
                : undefined,
            }
          : { type: draft.scheduleType };

      const designPayload = {
        title: name,
        description: draft.description.trim() || "用户自定义徽章",
        icon: draft.icon,
        color: draft.color,
      };
      const failureDesign = draft.failureEnabled
        ? {
            title: `${name} 未完成`,
            description: "目标周期内未完成",
            icon: "!",
            color: draft.failureColor || badgeDefaultFailureColor,
          }
        : null;
      const awardPolicy = {
        type: draft.awardType,
        target: draft.openEnded
          ? 0
          : Math.max(1, Math.floor(draft.target || 1)),
        failureEnabled: draft.failureEnabled,
        graceDays: Math.max(0, Math.floor(draft.graceDays || 0)),
      };
      const normalizedMilestones = normalizeMilestoneDrafts(draft.milestones);
      const milestoneError = validateMilestoneTargets(
        normalizedMilestones,
        awardPolicy.target,
      );
      if (milestoneError) {
        setError(milestoneError);
        message.error(milestoneError);
        return;
      }
      const milestones = normalizedMilestones.map((milestone, index) => ({
        targetValue: milestone.targetValue,
        milestoneKey: `target-${milestone.targetValue}`,
        title: milestone.title.trim() || `${name} ${milestone.targetValue}`,
        description: `${name} 达到 ${milestone.targetValue}`,
        icon: String(milestone.targetValue),
        color: draft.color,
        sortOrder: index,
      }));

      if (isEditing && editingDefinition) {
        const input: UpdateBadgeDefinitionInput = {
          id: editingDefinition.id,
          name,
          source: editingDefinition.source,
          successDesign: designPayload,
          failureDesign,
          rule,
          schedule,
          awardPolicy,
          milestones,
          retroactiveMode: editingDefinition.retroactiveMode,
        };
        await updateBadgeDefinition(input);
        await onSaved();
        onClose();
        message.success("徽章已更新");
      } else {
        const input: CreateBadgeDefinitionInput = {
          name,
          source: "custom",
          successDesign: designPayload,
          failureDesign,
          rule,
          schedule,
          awardPolicy,
          milestones,
          retroactiveMode: "disabled",
        };
        await createBadgeDefinition(input);
        await onSaved();
        setDraft(defaultDraft());
        setAdvanced(false);
        onClose();
        message.success("徽章已创建");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存徽章失败";
      setError(msg);
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={isEditing ? "编辑徽章" : "新建自定义徽章"}
      subtitle="定义目标、条件与周期，系统会在达成时自动颁奖。"
      widthClass="max-w-4xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={saving} onClick={handleSubmit}>
            {saving ? "保存中" : isEditing ? "保存修改" : "创建徽章"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6">
        {/* 预览 + 名称 */}
        <div className="grid gap-5 md:grid-cols-[0.8fr_1.2fr]">
          <BadgePreview
            name={draft.name}
            icon={draft.icon}
            color={draft.color}
            failureColor={draft.failureColor}
            description={draft.description}
            failureEnabled={draft.failureEnabled}
          />
          <div className="grid gap-4">
            <Field label="名称">
              <input
                className={inputClass}
                value={draft.name}
                placeholder="每天输出一张卡片"
                onChange={(e) =>
                  setDraft((c) => ({ ...c, name: e.target.value }))
                }
              />
            </Field>
            <Field label="描述" hint="展示在徽章下方，一句话说明目标">
              <input
                className={inputClass}
                value={draft.description}
                placeholder="每天至少新增一张永久卡片"
                onChange={(e) =>
                  setDraft((c) => ({ ...c, description: e.target.value }))
                }
              />
            </Field>
          </div>
        </div>

        {/* 徽章设计 */}
        <div className="grid gap-4">
          <Field label="徽章图标">
            <div className="flex flex-wrap gap-2">
              {badgeEmojiOptions.map((emoji) => {
                const selected = draft.icon === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setDraft((c) => ({ ...c, icon: emoji }))}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition ${
                      selected
                        ? "scale-110 border-slate-400/60 bg-slate-500/10 text-slate-700 shadow-sm dark:border-white/25 dark:bg-white/10 dark:text-white"
                        : `${themeColors.borderClass} ${themeColors.tagBgClass} ${themeColors.activeTextClass} hover:border-slate-400/40 dark:hover:border-white/20`
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="主题色">
            <div className="flex flex-wrap gap-2">
              {badgeColorPalette.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft((c) => ({ ...c, color }))}
                  style={{ backgroundColor: color }}
                  className={`h-9 w-9 rounded-full border-2 transition ${
                    draft.color === color
                      ? "scale-110 border-white shadow-lg"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </Field>
        </div>

        {/* 周期 + 类型 + 目标 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="周期">
            <BadgeSelect
              value={draft.scheduleType}
              options={scheduleOptions}
              onChange={(value) =>
                setDraft((c) => ({ ...c, scheduleType: value }))
              }
            />
          </Field>
          <Field label="徽章类型">
            <BadgeSelect
              value={draft.awardType}
              options={awardOptions}
              onChange={(value) =>
                setDraft((c) => ({ ...c, awardType: value }))
              }
            />
          </Field>
          {!draft.openEnded && (
            <Field label="目标值">
              <input
                className={inputClass}
                min={1}
                type="number"
                value={draft.target}
                onChange={(e) =>
                  setDraft((c) => ({ ...c, target: Number(e.target.value) }))
                }
              />
            </Field>
          )}
        </div>

        <div
          className={`rounded-2xl border border-dashed px-4 py-3 ${themeColors.borderClass}`}
        >
          <Toggle
            checked={draft.openEnded}
            onChange={(v) => setDraft((c) => ({ ...c, openEnded: v }))}
            label="长期任务"
            description="不设置最终目标，持续记录进度，可通过阶段目标获得里程碑徽章。"
          />
        </div>

        <MilestoneManager
          milestones={draft.milestones}
          badgeName={draft.name}
          finalTarget={draft.openEnded ? 0 : draft.target}
          onChange={(milestones) => setDraft((c) => ({ ...c, milestones }))}
        />

        {/* date_range 起止 */}
        {draft.scheduleType === "date_range" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="开始日期">
              <DatePicker
                value={draft.rangeStart ?? ""}
                placeholder="选择开始日期"
                accentColor={themeColors.accentColor}
                onChange={(value) =>
                  setDraft((c) => ({ ...c, rangeStart: value }))
                }
              />
            </Field>
            <Field label="结束日期">
              <DatePicker
                value={draft.rangeEnd ?? ""}
                placeholder="选择结束日期"
                accentColor={themeColors.accentColor}
                onChange={(value) =>
                  setDraft((c) => ({ ...c, rangeEnd: value }))
                }
              />
            </Field>
          </div>
        )}

        {/* 宽限天数 */}
        <Field
          label="宽限天数"
          hint="超过周期结束仍未达成才记失败，留 0 表示立即"
        >
          <input
            className={inputClass}
            min={0}
            type="number"
            value={draft.graceDays}
            disabled={!draft.failureEnabled}
            onChange={(e) =>
              setDraft((c) => ({ ...c, graceDays: Number(e.target.value) }))
            }
          />
        </Field>

        {/* 失败徽章开关 */}
        <div
          className={`rounded-2xl border border-dashed px-4 py-3 ${themeColors.borderClass}`}
        >
          <Toggle
            checked={draft.failureEnabled}
            onChange={(v) => setDraft((c) => ({ ...c, failureEnabled: v }))}
            label="失败徽章"
            description="开启后，超过宽限期仍未达成会留下失败记录，激发行动力。"
          />
          {draft.failureEnabled && (
            <div className="mt-3 grid gap-2">
              <span
                className={`text-xs font-medium uppercase tracking-wider ${themeColors.secondaryTextClass}`}
              >
                失败徽章配色
              </span>
              <div className="flex flex-wrap gap-2">
                {badgeFailureColorPalette.map((color) => {
                  const selected = draft.failureColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setDraft((c) => ({ ...c, failureColor: color }))
                      }
                      style={{ backgroundColor: color }}
                      className={`h-8 w-8 rounded-full border-2 transition ${
                        selected
                          ? "scale-110 border-white shadow-lg"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 完成条件 */}
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3
                className={`m-0 text-sm font-semibold ${themeColors.activeTextClass}`}
              >
                完成条件
              </h3>
              <p className={`mt-1 text-xs ${themeColors.secondaryTextClass}`}>
                {ruleLocked
                  ? "系统徽章规则为自动检测，不可编辑"
                  : advanced
                    ? "高级模式：多组条件组合"
                    : `简单模式：${manualLabel || "选择一个条件"}`}
              </p>
            </div>
            {ruleLocked ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${themeColors.tagBgClass} ${themeColors.secondaryTextClass}`}
              >
                <Lock size={12} />
                规则锁定
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${themeColors.tagBgClass} ${themeColors.activeTextClass} ${themeColors.hoverClass}`}
              >
                <Sparkles size={12} />
                {advanced ? "切回简单" : "高级模式"}
              </button>
            )}
          </div>
          {ruleLocked ? (
            <div
              className={`rounded-2xl border border-dashed px-4 py-4 text-xs ${themeColors.borderClass} ${themeColors.secondaryTextClass}`}
            >
              该徽章由系统自动管理，规则包含总量统计条件，暂不支持在表单中编辑。
              你仍可修改名称、外观、周期与目标值。
            </div>
          ) : (
            <RuleBuilder
              draft={draft.ruleDraft}
              advanced={advanced}
              onChange={(ruleDraft) => setDraft((c) => ({ ...c, ruleDraft }))}
            />
          )}
        </div>

        {error && (
          <div className="rounded-2xl bg-red-500/15 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

export default BadgeFormModal;
