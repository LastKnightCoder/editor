/**
 * 功能设置：常用组合（可多选）+ 按侧栏分组列出的功能开关。关掉的只是入口，内容不删。
 * 组合的勾选状态由开关推出：一组功能全开即勾上，没有「自定义」档。
 */

import { Check } from "lucide-react";
import clsx from "clsx";
import { Panel, SettingRow, Switch } from "@tau/ui";
import { useFeatures } from "@/app/featureQueries";
import {
  ALWAYS_ON_FEATURES,
  FEATURE_PRESETS,
  featureParent,
  isPresetChecked,
  setFeatureEnabled,
  togglePreset,
} from "@/app/features";
import { NAV_SECTIONS } from "@/app/navigation";
import { FEATURE_DESCRIPTIONS, PRESET_ICONS } from "@/app/featureCopy";
import { SettingsGroup } from "../components/SettingsGroup";

const LABELS = new Map(
  NAV_SECTIONS.flatMap(section => section.items.map(item => [item.key, item.label] as const))
);

export function FeaturesSection() {
  const { disabled, isEnabled, setDisabled } = useFeatures();

  return (
    <>
      <SettingsGroup
        title="常用组合"
        description="和首次启动时的选项相同，可以多选；取消一组只关掉其他已选组合用不到的功能"
        bare
      >
        <div className="grid grid-cols-4 gap-2">
          {FEATURE_PRESETS.map(preset => {
            const checked = isPresetChecked(preset, disabled);
            const Icon = PRESET_ICONS[preset.id];
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={checked}
                onClick={() => void setDisabled(togglePreset(preset, !checked, disabled))}
                className={clsx(
                  "bg-surface rounded-tau-md flex flex-col items-start gap-0.5 border px-3 py-2.5 text-left",
                  "ease-tau-out transition-[border-color,box-shadow] duration-[160ms]",
                  checked
                    ? "border-accent shadow-[0_0_0_3px_var(--tau-accent-soft)]"
                    : "border-line-1 hover:border-ink-3"
                )}
              >
                <span className="text-tau-body text-ink-1 flex w-full items-center gap-1.5 font-semibold">
                  {Icon && <Icon className="text-ink-2 size-[15px] shrink-0" strokeWidth={1.75} />}
                  {preset.label}
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "ml-auto grid size-4 place-items-center rounded-[5px] border",
                      checked ? "bg-accent border-accent text-ink-inverse" : "border-line-1"
                    )}
                  >
                    {checked && <Check className="size-3" strokeWidth={2.25} />}
                  </span>
                </span>
                <span className="text-tau-meta text-ink-3">
                  {preset.features.map(id => LABELS.get(id) ?? id).join("、")}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      {NAV_SECTIONS.map(section => {
        const items = section.items.filter(item => !ALWAYS_ON_FEATURES.has(item.key));
        if (!items.length) return null;
        return (
          <SettingsGroup key={section.id} title={section.label} bare>
            <Panel pad="none" className="rounded-[14px] p-1.5">
              {items.map(item => {
                const parent = featureParent(item.key);
                const parentLabel = parent ? LABELS.get(parent) : undefined;
                const parentOff = parent ? !isEnabled(parent) : false;
                const Icon = item.icon;
                const description = parentOff
                  ? `依附于${parentLabel}，已随它收起`
                  : parentLabel
                    ? `依附于${parentLabel} · ${FEATURE_DESCRIPTIONS[item.key] ?? ""}`
                    : FEATURE_DESCRIPTIONS[item.key];
                return (
                  <SettingRow
                    key={item.key}
                    className={clsx(parent && "pl-12", parentOff && "opacity-55")}
                    title={
                      <span className="flex items-center gap-2.5">
                        <Icon
                          className="text-ink-2 size-[17px] shrink-0"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {item.label}
                      </span>
                    }
                    description={description}
                  >
                    <Switch
                      aria-label={item.label}
                      checked={isEnabled(item.key)}
                      disabled={parentOff}
                      onCheckedChange={next =>
                        void setDisabled(setFeatureEnabled(item.key, next, disabled))
                      }
                    />
                  </SettingRow>
                );
              })}
            </Panel>
          </SettingsGroup>
        );
      })}
    </>
  );
}
