/**
 * 外观设置 —— 行流式。
 *
 * 功能对齐 legacy AppearanceSetting 全量：明暗（升级三档：跟随系统 / 浅色 / 深色）与
 * 主题族（每套主题自带深浅两套配色）两个正交维度，接 themeStore；中文字体 / 英文字体 / 字号 / 代码字体、图片默认圆角 /
 * 阴影。主题色 6 色板不迁移（新主题体系 accent 随主题内置）。
 * 字体与字号是应用级默认（全局生效）：useSyncFont 在 root
 * 覆盖 --tau-font / --tau-font-mono 并按 13px 基准阻尼缩放字号档位（壳层 UI 半速率
 * 跟随；编辑器内容经 --font-size 1:1 跟随）；图片外观仍只作用于内容区图片。
 */

import { useAppearanceI18n, type AppearanceKey } from "../appearanceI18n";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import clsx from "clsx";
import { produce } from "immer";
import {
  type ImageBorderRadiusPreset,
  type ImageShadowPreset,
} from "@tau/editor/extensions/media/types";
import {
  HIGHLIGHT_STYLES,
  HighlightMark,
  type HighlightStyle,
} from "@tau/editor/extensions/text-formatting";
import { useThemeStore } from "@tau/themes/react";
import type { CSSProperties, ReactNode } from "react";
import {
  DEFAULT_THEME_KEY,
  getTheme,
  listThemes,
  type Appearance,
  type SemanticTokens,
  type ThemeDefinition,
} from "@tau/themes";
import { SettingRow, Select, Switch } from "@tau/ui";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import { getAllFonts } from "@/commands";
import { FontSelect } from "../components/FontSelect";
import { SettingsGroup } from "../components/SettingsGroup";

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 24;

const RADIUS_OPTIONS: Array<{ value: ImageBorderRadiusPreset; label: AppearanceKey }> = [
  { value: "none", label: "radius.none" },
  { value: "sm", label: "radius.sm" },
  { value: "md", label: "radius.md" },
  { value: "lg", label: "radius.lg" },
];

const SHADOW_OPTIONS: Array<{ value: ImageShadowPreset; label: AppearanceKey }> = [
  { value: "none", label: "shadow.none" },
  { value: "sm", label: "shadow.sm" },
  { value: "md", label: "shadow.md" },
  { value: "lg", label: "shadow.lg" },
];

const APPEARANCE_OPTIONS: Array<{ value: Appearance; caption: AppearanceKey }> = [
  { value: "system", caption: "mode.system" },
  { value: "light", caption: "mode.light" },
  { value: "dark", caption: "mode.dark" },
];

export function AppearanceSection() {
  const { t } = useAppearanceI18n();
  const setting = useSettingStore(s => s.setting);
  const onFontSettingChange = useSettingStore(s => s.onFontSettingChange);
  const { fontSetting, appearance } = setting;

  const themeKey = useThemeStore(s => s.theme);
  const appearancePref = useThemeStore(s => s.appearance);
  const mode = useThemeStore(s => s.mode);
  const setTheme = useThemeStore(s => s.setTheme);
  const setAppearance = useThemeStore(s => s.setAppearance);
  const fallbackTheme = getTheme(DEFAULT_THEME_KEY);
  if (!fallbackTheme) throw new Error("默认主题未注册");
  const currentTheme = getTheme(themeKey) ?? fallbackTheme;
  const themes = listThemes();

  /* 系统字体清单：一次性查询（staleTime Infinity，不随窗口聚焦重拉） */
  const { data: fonts } = useQuery({
    queryKey: ["settings", "fonts"],
    queryFn: getAllFonts,
    staleTime: Infinity,
  });

  const updateImage = (patch: Partial<NonNullable<ISetting["appearance"]>["image"]>) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        if (!draft.appearance) draft.appearance = {};
        if (!draft.appearance.image) draft.appearance.image = {};
        Object.assign(draft.appearance.image, patch);
      }),
    }));
  };

  const imageShadow: ImageShadowPreset = appearance?.image?.shadow ?? "none";
  const highlightStyle: HighlightStyle = appearance?.highlight?.style ?? "flat";

  const backdropEnabled = appearance?.backdrop?.enabled !== false;
  const backdropMotion = appearance?.backdrop?.motion !== false;
  const updateBackdrop = (patch: NonNullable<NonNullable<ISetting["appearance"]>["backdrop"]>) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        if (!draft.appearance) draft.appearance = {};
        draft.appearance.backdrop = { ...draft.appearance.backdrop, ...patch };
      }),
    }));
  };

  const updateHighlightStyle = (style: HighlightStyle) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        if (!draft.appearance) draft.appearance = {};
        draft.appearance.highlight = { ...draft.appearance.highlight, style };
      }),
    }));
  };

  return (
    <>
      <SettingsGroup title={t("mode.title")} description={t("mode.description")}>
        <div className="grid grid-cols-3 gap-3 px-1.5 pt-2.5 pb-1">
          {APPEARANCE_OPTIONS.map(option => (
            <ChoiceCard
              key={option.value}
              active={appearancePref === option.value}
              onSelect={() => setAppearance(option.value)}
              caption={t(option.caption)}
            >
              {option.value === "system" ? (
                <SplitPreview theme={currentTheme} lit={appearancePref === "system"} />
              ) : (
                <WindowPreview
                  tokens={currentTheme[option.value].tokens}
                  lit={appearancePref === option.value}
                />
              )}
            </ChoiceCard>
          ))}
        </div>
        <div className="text-tau-meta text-ink-2 px-3 pt-1.5 pb-2">
          {t("mode.active")}
          <span className="text-ink-1 font-medium">
            {currentTheme.name} · {mode === "dark" ? t("mode.dark") : t("mode.light")}
          </span>
          {appearancePref === "system" && t("mode.following")}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("theme.title")} description={t("theme.description")}>
        <div className="grid grid-cols-3 gap-3 px-1.5 pt-2.5 pb-2.5">
          {themes.map(theme => (
            <ChoiceCard
              key={theme.key}
              active={theme.key === currentTheme.key}
              onSelect={() => setTheme(theme.key)}
              caption={theme.name}
            >
              <SplitPreview theme={theme} lit={theme.key === currentTheme.key} />
            </ChoiceCard>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("background.title")}>
        <SettingRow title={t("background.gradient")} description={t("background.description")}>
          <Switch
            aria-label={t("background.gradient")}
            checked={backdropEnabled}
            onCheckedChange={enabled => updateBackdrop({ enabled })}
          />
        </SettingRow>
        <SettingRow title={t("background.motion")} description={t("background.motionDescription")}>
          <Switch
            aria-label={t("background.motionLabel")}
            checked={backdropMotion}
            disabled={!backdropEnabled}
            onCheckedChange={motion => updateBackdrop({ motion })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("font.title")} description={t("font.description")}>
        <SettingRow title={t("font.chinese")}>
          <FontSelect
            kind="chinese"
            aria-label={t("font.chinese")}
            value={fontSetting.chineseFont}
            fonts={fonts}
            onChange={chineseFont => onFontSettingChange({ ...fontSetting, chineseFont })}
          />
        </SettingRow>
        <SettingRow title={t("font.english")}>
          <FontSelect
            kind="english"
            aria-label={t("font.english")}
            value={fontSetting.englishFont}
            fonts={fonts}
            onChange={englishFont => onFontSettingChange({ ...fontSetting, englishFont })}
          />
        </SettingRow>
        <SettingRow title={t("font.code")} description={t("font.codeDescription")}>
          <FontSelect
            kind="code"
            aria-label={t("font.code")}
            value={fontSetting.codeFont}
            fonts={fonts}
            onChange={codeFont => onFontSettingChange({ ...fontSetting, codeFont })}
          />
        </SettingRow>
        <SettingRow title={t("font.size")} description={t("font.sizeDescription")}>
          <FontSizeStepper
            value={fontSetting.fontSize}
            onChange={fontSize => onFontSettingChange({ ...fontSetting, fontSize })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("highlight.title")} description={t("highlight.description")}>
        <div className="grid grid-cols-4 gap-3 px-1.5 pt-2.5 pb-2.5">
          {HIGHLIGHT_STYLES.map(style => (
            <ChoiceCard
              key={style.id}
              active={highlightStyle === style.id}
              onSelect={() => updateHighlightStyle(style.id)}
              caption={t(`highlight.${style.id}`)}
            >
              <HighlightPreview style={style.id} />
            </ChoiceCard>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("image.title")} description={t("image.description")}>
        <SettingRow title={t("image.radius")}>
          <Select
            aria-label={t("image.radiusLabel")}
            className="w-[150px]"
            value={appearance?.image?.borderRadius ?? "none"}
            options={RADIUS_OPTIONS.map(option => ({
              value: option.value,
              label: t(option.label),
            }))}
            onValueChange={v => updateImage({ borderRadius: v as ImageBorderRadiusPreset })}
          />
        </SettingRow>
        <SettingRow title={t("image.shadow")}>
          <Select
            aria-label={t("image.shadowLabel")}
            className="w-[150px]"
            value={imageShadow}
            options={SHADOW_OPTIONS.map(option => ({
              value: option.value,
              label: t(option.label),
            }))}
            onValueChange={v => updateImage({ shadow: v as ImageShadowPreset })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

/** 选择卡：描边卡 + 单选圆点（选中 = accent 描边 + 圆点，不托起），上方放预览窗口。 */
function ChoiceCard({
  active,
  onSelect,
  caption,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  caption: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={clsx(
        "bg-surface rounded-tau-md cursor-pointer p-[7px] text-left",
        "ease-tau-out transition-shadow duration-[160ms]",
        active
          ? "shadow-[inset_0_0_0_1.5px_var(--color-accent)]"
          : "shadow-[inset_0_0_0_1px_var(--color-line-1)] hover:shadow-[inset_0_0_0_1px_var(--color-ink-3)]"
      )}
    >
      <div className="relative h-[84px] overflow-hidden rounded-[8px]">{children}</div>
      <div
        className={clsx(
          "text-tau-body text-ink-1 flex items-center gap-[7px] px-1 pb-0.5 pt-2",
          active && "font-medium"
        )}
      >
        <span
          className={clsx(
            "size-3.5 shrink-0 rounded-full transition-shadow duration-[160ms]",
            active
              ? "shadow-[inset_0_0_0_4.5px_var(--color-accent)]"
              : "shadow-[inset_0_0_0_1.5px_var(--color-track)]"
          )}
        />
        {caption}
      </div>
    </button>
  );
}

/** 笔触预览：两段不同色的高亮，画在当前明暗下 */
function HighlightPreview({ style }: { style: HighlightStyle }) {
  const { t } = useAppearanceI18n();
  return (
    <div className="text-tau-body text-ink-1 absolute inset-0 flex flex-col justify-center gap-1.5 px-3 leading-[1.7]">
      <span>
        <HighlightMark type="yellow" variant={style}>
          {t("preview.review")}
        </HighlightMark>
        {t("preview.reviewSuffix")}
      </span>
      <span>
        {t("preview.recallPrefix")}
        <HighlightMark type="green" variant={style}>
          {t("preview.recall")}
        </HighlightMark>
      </span>
    </div>
  );
}

/* 预览窗口取色直接读主题 token（与设置页自身所处主题无关，每张卡画的是「那套配色」） */
const pageStyle = (t: SemanticTokens): CSSProperties => ({ background: t["bg-page"] });
const railStyle = (t: SemanticTokens): CSSProperties => ({
  background: t["bg-surface"],
  borderColor: t["line-1"],
});
const barStyle = (t: SemanticTokens): CSSProperties => ({ background: t["bg-sunken"] });

/** 单一明暗的迷你窗口：侧栏 + 两行文字 + accent 按钮（选中时用该配色的 accent 点亮） */
function WindowPreview({ tokens, lit }: { tokens: SemanticTokens; lit: boolean }) {
  return (
    <div className="absolute inset-0" style={pageStyle(tokens)}>
      <div className="absolute inset-y-0 left-0 w-10 border-r" style={railStyle(tokens)} />
      <div
        className="absolute top-3 left-[52px] h-[7px] w-[58px] rounded-full"
        style={barStyle(tokens)}
      />
      <div
        className="absolute top-[26px] left-[52px] h-[7px] w-[80px] rounded-full"
        style={barStyle(tokens)}
      />
      <div
        className="absolute top-10 left-[52px] h-[10px] w-[42px] rounded-[4px] transition-colors duration-[160ms]"
        style={{ background: lit ? tokens.accent : tokens["bg-sunken"] }}
      />
    </div>
  );
}

/** 深浅分屏：左右两半各画该主题族浅/深一套完整迷你窗口（跟随系统 / 主题族卡共用） */
function SplitPreview({ theme, lit }: { theme: ThemeDefinition; lit: boolean }) {
  const light = theme.light.tokens;
  const dark = theme.dark.tokens;
  return (
    <>
      <div className="absolute inset-y-0 left-0 w-1/2" style={pageStyle(light)}>
        <div className="absolute inset-y-0 left-0 w-[18px] border-r" style={railStyle(light)} />
        <div
          className="absolute top-[22px] left-[24px] h-[6px] w-[26px] rounded-full"
          style={barStyle(light)}
        />
        <div
          className="absolute top-[34px] left-[24px] h-[6px] w-[34px] rounded-full"
          style={barStyle(light)}
        />
        <div
          className="absolute top-[46px] left-[24px] h-[8px] w-[20px] rounded-[3px] transition-colors duration-[160ms]"
          style={{ background: lit ? light.accent : light["bg-sunken"] }}
        />
      </div>
      <div className="absolute inset-y-0 right-0 w-1/2" style={pageStyle(dark)}>
        <div className="absolute inset-y-0 right-0 w-[18px] border-l" style={railStyle(dark)} />
        <div
          className="absolute top-[22px] right-[24px] h-[6px] w-[26px] rounded-full"
          style={barStyle(dark)}
        />
        <div
          className="absolute top-[34px] right-[24px] h-[6px] w-[34px] rounded-full"
          style={barStyle(dark)}
        />
        <div
          className="absolute top-[46px] right-[24px] h-[8px] w-[20px] rounded-[3px] transition-colors duration-[160ms]"
          style={{ background: lit ? dark.accent : dark["bg-sunken"] }}
        />
      </div>
    </>
  );
}

/** 字号 stepper：−/值/+（边界禁用；NumberInput 的键入形态不适合这里的三击节奏） */
function FontSizeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useAppearanceI18n();
  const dec = () => onChange(Math.max(FONT_SIZE_MIN, value - 1));
  const inc = () => onChange(Math.min(FONT_SIZE_MAX, value + 1));
  return (
    <div className="border-line-1 bg-surface rounded-tau-sm flex h-8 items-center overflow-hidden border">
      <button
        type="button"
        onClick={dec}
        disabled={value <= FONT_SIZE_MIN}
        aria-label={t("font.decrease")}
        className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-[30px] place-items-center disabled:pointer-events-none disabled:opacity-35"
      >
        <Minus size={13} strokeWidth={1.75} />
      </button>
      <span className="text-tau-sm w-11 text-center font-medium tabular-nums">{value}</span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= FONT_SIZE_MAX}
        aria-label={t("font.increase")}
        className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-[30px] place-items-center disabled:pointer-events-none disabled:opacity-35"
      >
        <Plus size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
