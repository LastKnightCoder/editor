import { useMemo, useState } from "react";
import { MERMAID_THEME_NAMES } from "@tau/shared";
import type { SettingCompat } from "../../../types";
import {
  getNormalizedMermaidSetting,
  patchMermaidSetting,
} from "../../../services/mermaidSettings";
import type { SettingsPageProps } from "./types";
import { ActionSheet } from "./ActionSheet";
import { CheckMark, FieldSheetTrigger, SwitchButton } from "./ui";

type ThemeSectionProps = {
  isDark: boolean;
  setIsDark: (next: boolean) => void;
  safeSetting: SettingCompat | null;
  updateSetting: SettingsPageProps["updateSetting"];
};

export function ThemeSection(props: ThemeSectionProps) {
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const [lightThemeSheetOpen, setLightThemeSheetOpen] = useState(false);
  const [darkThemeSheetOpen, setDarkThemeSheetOpen] = useState(false);
  const mermaidSetting = getNormalizedMermaidSetting(props.safeSetting);

  const mermaidStyleOptions = [
    { label: "SVG（图形渲染）", value: "svg" },
    { label: "ASCII（Unicode 字符）", value: "ascii-unicode" },
  ] as const;
  const mermaidThemeOptions = useMemo(
    () =>
      MERMAID_THEME_NAMES.map((themeName) => ({
        label: themeName,
        value: themeName,
      })),
    [],
  );
  const mermaidStyleLabel =
    mermaidStyleOptions.find((item) => item.value === mermaidSetting.style)
      ?.label ?? "SVG（图形渲染）";

  const updateMermaid = (
    patch: Partial<{
      style: "svg" | "ascii-unicode";
      lightTheme: (typeof MERMAID_THEME_NAMES)[number];
      darkTheme: (typeof MERMAID_THEME_NAMES)[number];
      useBeautifulMermaid: boolean;
    }>,
  ) => {
    props.updateSetting((prev) => patchMermaidSetting(prev, patch), {
      persist: true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <h2 className="mb-3 text-[15px] font-medium text-gray-800 dark:text-gray-100">
          主题模式
        </h2>
        <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => props.setIsDark(false)}
            className="list-item w-full"
          >
            <span className="text-[15px] text-gray-800 dark:text-gray-100">
              浅色
            </span>
            {!props.isDark && <CheckMark />}
          </button>
          <button
            type="button"
            onClick={() => props.setIsDark(true)}
            className="list-item w-full border-t border-gray-100 dark:border-neutral-800"
          >
            <span className="text-[15px] text-gray-800 dark:text-gray-100">
              深色
            </span>
            {props.isDark && <CheckMark />}
          </button>
        </div>
      </div>

      <div className="list-group p-4">
        <h2 className="mb-1 text-[15px] font-medium text-gray-800 dark:text-gray-100">
          Mermaid 渲染
        </h2>
        <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
          默认使用 beautiful-mermaid。关闭后将统一改为 Mermaid 原生 SVG 渲染。
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 dark:border-neutral-800">
            <div>
              <div className="text-[15px] text-gray-800 dark:text-gray-100">
                启用 beautiful-mermaid
              </div>
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                关闭后 ASCII 渲染和 Mermaid 自定义主题会一并停用。
              </div>
            </div>
            <SwitchButton
              checked={mermaidSetting.useBeautifulMermaid}
              onChange={() =>
                updateMermaid({
                  useBeautifulMermaid: !mermaidSetting.useBeautifulMermaid,
                })
              }
            />
          </div>
          <FieldSheetTrigger
            label="渲染风格"
            value={mermaidStyleLabel}
            placeholder="请选择渲染风格"
            disabled={!mermaidSetting.useBeautifulMermaid}
            onOpen={() => setStyleSheetOpen(true)}
          />
          <FieldSheetTrigger
            label="浅色主题"
            value={mermaidSetting.lightTheme}
            placeholder="请选择浅色主题"
            disabled={!mermaidSetting.useBeautifulMermaid}
            onOpen={() => setLightThemeSheetOpen(true)}
          />
          <FieldSheetTrigger
            label="深色主题"
            value={mermaidSetting.darkTheme}
            placeholder="请选择深色主题"
            disabled={!mermaidSetting.useBeautifulMermaid}
            onOpen={() => setDarkThemeSheetOpen(true)}
          />
        </div>
      </div>

      <ActionSheet
        open={styleSheetOpen}
        title="选择 Mermaid 渲染风格"
        value={mermaidSetting.style}
        options={mermaidStyleOptions.map((item) => ({
          label: item.label,
          value: item.value,
        }))}
        onClose={() => setStyleSheetOpen(false)}
        onSelect={(value) => {
          if (value === "svg" || value === "ascii-unicode") {
            updateMermaid({ style: value });
          }
        }}
      />
      <ActionSheet
        open={lightThemeSheetOpen}
        title="选择 Mermaid 浅色主题"
        value={mermaidSetting.lightTheme}
        options={mermaidThemeOptions}
        onClose={() => setLightThemeSheetOpen(false)}
        onSelect={(value) => {
          if (
            MERMAID_THEME_NAMES.includes(
              value as (typeof MERMAID_THEME_NAMES)[number],
            )
          ) {
            updateMermaid({
              lightTheme: value as (typeof MERMAID_THEME_NAMES)[number],
            });
          }
        }}
      />
      <ActionSheet
        open={darkThemeSheetOpen}
        title="选择 Mermaid 深色主题"
        value={mermaidSetting.darkTheme}
        options={mermaidThemeOptions}
        onClose={() => setDarkThemeSheetOpen(false)}
        onSelect={(value) => {
          if (
            MERMAID_THEME_NAMES.includes(
              value as (typeof MERMAID_THEME_NAMES)[number],
            )
          ) {
            updateMermaid({
              darkTheme: value as (typeof MERMAID_THEME_NAMES)[number],
            });
          }
        }}
      />
    </div>
  );
}
