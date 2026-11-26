/**
 * 新建工作区的首次启动：整窗问「你主要用 Tau 做什么？」，按所选组合决定开哪些功能。
 * 一个都不选 = 全部打开。保存失败留在本页可重试。
 */

import { useFeatureI18n } from "@/app/features.i18n";
import { useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { isMac } from "@/platform";
import { FEATURE_PRESETS, disabledForPresets } from "./features";
import { PRESET_ICONS } from "./featureCopy";
import { useSaveWorkspacePreferences } from "./featureQueries";
import { NAV_SECTIONS, TOGGLEABLE_NAV_KEYS } from "./navigation";
import { MacTrafficLights, WindowControls } from "./WindowControls";

export function FeatureOnboarding() {
  const { t, locale } = useFeatureI18n();
  const labels = new Map(
    NAV_SECTIONS.flatMap(section => section.items.map(item => [item.key, item.label] as const))
  );
  const save = useSaveWorkspacePreferences();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const enabledCount = new Set(
    FEATURE_PRESETS.filter(preset => selected.includes(preset.id)).flatMap(p => p.features)
  ).size;

  const finish = (presetIds: string[]) => {
    setSaving(true);
    void save({
      disabledFeatures: disabledForPresets(TOGGLEABLE_NAV_KEYS, presetIds),
      onboarding: "done",
    }).finally(() => setSaving(false));
  };

  return (
    <div className="col-span-full flex min-h-0 flex-col">
      <header className="app-region-drag flex h-[var(--tau-titlebar-h)] shrink-0 items-center px-3.5">
        {isMac ? <MacTrafficLights collapsed={false} /> : <span className="flex-1" />}
        {!isMac && (
          <div className="app-region-no-drag">
            <WindowControls />
          </div>
        )}
      </header>
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="m-auto flex w-[500px] max-w-full flex-col px-6 pb-10">
          <h1 className="text-tau-title-lg text-center font-bold tracking-[-0.01em]">
            {t("onboard.title")}
          </h1>
          <p className="text-tau-body text-ink-2 mt-1.5 text-center">
            {t("onboard.description")}
            <br />
            {t("onboard.settingsHint")}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {FEATURE_PRESETS.map(preset => {
              const on = selected.includes(preset.id);
              const Icon = PRESET_ICONS[preset.id];
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={on}
                  disabled={saving}
                  onClick={() =>
                    setSelected(list =>
                      on ? list.filter(id => id !== preset.id) : [...list, preset.id]
                    )
                  }
                  className={clsx(
                    "bg-surface rounded-tau-md flex items-center gap-3.5 border px-3.5 py-3 text-left",
                    "ease-tau-out transition-[border-color,box-shadow] duration-[160ms]",
                    on
                      ? "border-accent shadow-[0_0_0_3px_var(--tau-accent-soft)]"
                      : "border-line-1 hover:border-ink-3"
                  )}
                >
                  <span
                    className={clsx(
                      "border-line-1 grid size-9 shrink-0 place-items-center rounded-[10px] border",
                      on ? "text-accent-text" : "text-ink-2"
                    )}
                  >
                    {Icon && <Icon className="size-[18px]" strokeWidth={1.75} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-tau-body-lg block font-semibold">
                      {t(preset.labelKey)}
                    </span>
                    <span className="text-tau-meta text-ink-3 block">
                      {preset.features.map(id => labels.get(id) ?? id).join(t("list.separator"))}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "grid size-5 shrink-0 place-items-center rounded-md border-[1.5px]",
                      on ? "bg-accent border-accent text-ink-inverse" : "border-line-1"
                    )}
                  >
                    {on && <Check className="size-3.5" strokeWidth={2.25} />}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => finish(selected)}
            className="bg-accent text-ink-inverse rounded-tau-md text-tau-body-lg mt-5 h-[42px] font-semibold disabled:opacity-60"
          >
            {selected.length
              ? t("onboard.enter", {
                  count: enabledCount,
                  amount: enabledCount.toLocaleString(locale),
                })
              : t("onboard.all")}
          </button>
          {selected.length ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => finish([])}
              className="text-tau-body text-ink-2 hover:text-ink-1 mt-2.5 self-center"
            >
              {t("onboard.all")}
            </button>
          ) : (
            <p className="text-tau-body text-ink-3 mt-2.5 text-center">{t("onboard.later")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
