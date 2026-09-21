/**
 * 外观设置 —— 方案 A 行流式定稿（2026-09-21，mockups/settings/appearance/plan-a-rows）。
 *
 * 功能对齐 legacy AppearanceSetting 全量：主题模式（升级三档：跟随系统 / 浅色 /
 * 深色，接 themeStore）、中文字体 / 英文字体 / 字号 / 代码字体、图片默认圆角 /
 * 阴影。主题色 6 色板不迁移（新主题体系 accent 随主题内置，D-028）。
 * 字体与字号是应用级默认（2026-09-21 用户裁决全局生效）：useSyncFont 在 root
 * 覆盖 --tau-font / --tau-font-mono 并按 13px 基准等比缩放字号档位，界面与
 * 编辑器内容统一消费；图片外观仍只作用于内容区图片。
 */

import { useQuery } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import clsx from "clsx";
import { produce } from "immer";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "@tau/editor";
import { useThemeStore } from "@tau/ui/theme/runtime";
import { DEFAULT_DARK_KEY, DEFAULT_LIGHT_KEY } from "@tau/ui/theme";
import { Select } from "@tau/ui/Select";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import { getAllFonts } from "@/commands";
import { SettingRow } from "../components/SettingRow";
import { FontSelect } from "../components/FontSelect";
import { SectionTitle } from "../components/SectionTitle";

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 24;

const RADIUS_OPTIONS: Array<{ value: ImageBorderRadiusPreset; label: string }> = [
  { value: "none", label: "无圆角" },
  { value: "sm", label: "小圆角" },
  { value: "md", label: "中圆角" },
  { value: "lg", label: "大圆角" },
];

const SHADOW_OPTIONS: Array<{ value: ImageShadowPreset; label: string }> = [
  { value: "none", label: "无阴影" },
  { value: "sm", label: "小阴影" },
  { value: "md", label: "中阴影" },
  { value: "lg", label: "大阴影" },
];

const THEME_NAMES: Record<string, string> = {
  [DEFAULT_LIGHT_KEY]: "浅色 · Cream",
  [DEFAULT_DARK_KEY]: "深色 · Cocoa",
};

export function AppearanceSection() {
  const setting = useSettingStore(s => s.setting);
  const onFontSettingChange = useSettingStore(s => s.onFontSettingChange);
  const { fontSetting, appearance } = setting;

  const mode = useThemeStore(s => s.mode);
  const setMode = useThemeStore(s => s.setMode);

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

  /* 历史 boolean 阴影值归一化（true→md / false·缺省→none），写入时即清洗 */
  const rawShadow = appearance?.image?.shadow;
  const imageShadow: ImageShadowPreset =
    rawShadow === true ? "md" : rawShadow === false || !rawShadow ? "none" : rawShadow;

  return (
    <section>
      <h3 className="text-tau-body-lg font-semibold">外观</h3>
      <p className="text-tau-meta text-ink-3 mt-0.5">主题与编辑器呈现——更改即刻生效</p>

      <SectionTitle title="界面 · 主题" />
      <div className="flex gap-3 py-2 pb-1.5">
        <ThemeModeCard
          active={mode === "system"}
          onSelect={() => setMode("system")}
          caption="跟随系统"
          preview="system"
        />
        <ThemeModeCard
          active={mode === DEFAULT_LIGHT_KEY}
          onSelect={() => setMode(DEFAULT_LIGHT_KEY)}
          caption={THEME_NAMES[DEFAULT_LIGHT_KEY]}
          preview="light"
        />
        <ThemeModeCard
          active={mode === DEFAULT_DARK_KEY}
          onSelect={() => setMode(DEFAULT_DARK_KEY)}
          caption={THEME_NAMES[DEFAULT_DARK_KEY]}
          preview="dark"
        />
      </div>

      <SectionTitle title="界面 · 字体" desc="应用默认字体与字号——界面与编辑器内容统一生效" />
      <SettingRow title="中文字体">
        <FontSelect
          kind="chinese"
          aria-label="中文字体"
          value={fontSetting.chineseFont}
          fonts={fonts}
          onChange={chineseFont => onFontSettingChange({ ...fontSetting, chineseFont })}
        />
      </SettingRow>
      <SettingRow title="英文字体">
        <FontSelect
          kind="english"
          aria-label="英文字体"
          value={fontSetting.englishFont}
          fonts={fonts}
          onChange={englishFont => onFontSettingChange({ ...fontSetting, englishFont })}
        />
      </SettingRow>
      <SettingRow title="字号">
        <FontSizeStepper
          value={fontSetting.fontSize}
          onChange={fontSize => onFontSettingChange({ ...fontSetting, fontSize })}
        />
      </SettingRow>
      <SettingRow title="代码字体" description="代码块与界面等宽文本">
        <FontSelect
          kind="code"
          aria-label="代码字体"
          value={fontSetting.codeFont}
          fonts={fonts}
          onChange={codeFont => onFontSettingChange({ ...fontSetting, codeFont })}
        />
      </SettingRow>

      <SectionTitle title="内容 · 图片" desc="单图与图库未单独指定时使用的默认外观" />
      <SettingRow title="图片圆角">
        <Select
          aria-label="图片圆角"
          className="w-[150px]"
          value={appearance?.image?.borderRadius ?? "none"}
          options={RADIUS_OPTIONS}
          onValueChange={v => updateImage({ borderRadius: v as ImageBorderRadiusPreset })}
        />
      </SettingRow>
      <SettingRow title="图片阴影">
        <Select
          aria-label="图片阴影"
          className="w-[150px]"
          value={imageShadow}
          options={SHADOW_OPTIONS}
          onValueChange={v => updateImage({ shadow: v as ImageShadowPreset })}
        />
      </SettingRow>
    </section>
  );
}

/** 主题模式卡：选中态由主题自己的语言表达——预览窗口里的 accent 按钮点亮
 *  （用该主题固有 accent 色），卡片托起 + 圆形徽标；跟随系统卡 = 左右两半
 *  各自完整的迷你窗口（两个主题都可能是它，不另造符号）。 */
function ThemeModeCard({
  active,
  onSelect,
  caption,
  preview,
}: {
  active: boolean;
  onSelect: () => void;
  caption: string;
  preview: "system" | "light" | "dark";
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={clsx(
        "border-line-1 bg-surface rounded-tau-md flex-1 cursor-pointer border-[1.5px] p-[7px] text-left",
        "ease-tau-out transition-[border-color,box-shadow,transform] duration-[160ms]",
        active ? "border-accent shadow-card -translate-y-0.5" : "hover:border-ink-3/60"
      )}
    >
      <div className="relative h-[72px] overflow-hidden rounded-[7px] border border-black/5">
        {preview === "system" && (
          /* 左右两半各画一个完整迷你窗口（浅/深各半），分屏即「随系统而定」 */
          <>
            <div className="absolute inset-y-0 left-0 w-1/2 bg-[#f3eee2]">
              <div className="absolute inset-y-0 left-0 w-[18px] border-r border-[#e9e1d2] bg-[#fffdf9]" />
              <div className="absolute left-[24px] top-[22px] h-[6px] w-[26px] rounded-full bg-[#e2d8c0]" />
              <div className="absolute left-[24px] top-[34px] h-[6px] w-[34px] rounded-full bg-[#ece4d4]" />
            </div>
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[#221d16]">
              <div className="absolute inset-y-0 right-0 w-[18px] border-l border-[#3a3227] bg-[#2e2820]" />
              <div className="absolute right-[24px] top-[22px] h-[6px] w-[26px] rounded-full bg-[#100d08]" />
              <div className="absolute right-[24px] top-[34px] h-[6px] w-[34px] rounded-full bg-[#19150e]" />
            </div>
          </>
        )}
        {preview === "light" && (
          <div className="absolute inset-0 bg-[#f3eee2]">
            <div className="absolute inset-y-0 left-0 w-10 border-r border-[#e9e1d2] bg-[#fffdf9]" />
            <div className="absolute left-[52px] top-3 h-[7px] w-[58px] rounded-full bg-[#e2d8c0]" />
            <div className="absolute left-[52px] top-[26px] h-[7px] w-[80px] rounded-full bg-[#ece4d4]" />
            <div
              className={clsx(
                "absolute left-[52px] top-10 h-[10px] w-[42px] rounded-[4px] transition-colors duration-[160ms]",
                active ? "bg-[#aa5f3d]" : "bg-[#e2d8c0]"
              )}
            />
          </div>
        )}
        {preview === "dark" && (
          <div className="absolute inset-0 bg-[#221d16]">
            <div className="absolute inset-y-0 left-0 w-10 border-r border-[#3a3227] bg-[#2e2820]" />
            <div className="absolute left-[52px] top-3 h-[7px] w-[58px] rounded-full bg-[#100d08]" />
            <div className="absolute left-[52px] top-[26px] h-[7px] w-[80px] rounded-full bg-[#19150e]" />
            <div
              className={clsx(
                "absolute left-[52px] top-10 h-[10px] w-[42px] rounded-[4px] transition-colors duration-[160ms]",
                active ? "bg-[#e49b6d]" : "bg-[#100d08]"
              )}
            />
          </div>
        )}
      </div>
      <div className="text-tau-sm text-ink-1 mt-[7px] flex items-center gap-1.5 pl-0.5 font-medium">
        <span
          className={clsx(
            "grid size-4 shrink-0 place-items-center rounded-full transition-[background,opacity] duration-[160ms]",
            active ? "bg-accent opacity-100" : "bg-group opacity-0"
          )}
        >
          <Check size={10} strokeWidth={2.5} className="text-ink-inverse" />
        </span>
        {caption}
      </div>
    </button>
  );
}

/** 字号 stepper：−/值/+（边界禁用；NumberInput 的键入形态不适合这里的三击节奏） */
function FontSizeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const dec = () => onChange(Math.max(FONT_SIZE_MIN, value - 1));
  const inc = () => onChange(Math.min(FONT_SIZE_MAX, value + 1));
  return (
    <div className="border-line-1 bg-surface rounded-tau-sm flex h-8 items-center overflow-hidden border">
      <button
        type="button"
        onClick={dec}
        disabled={value <= FONT_SIZE_MIN}
        aria-label="减小字号"
        className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-[30px] place-items-center disabled:pointer-events-none disabled:opacity-35"
      >
        <Minus size={13} strokeWidth={1.75} />
      </button>
      <span className="text-tau-sm w-11 text-center font-medium tabular-nums">{value}</span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= FONT_SIZE_MAX}
        aria-label="增大字号"
        className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-[30px] place-items-center disabled:pointer-events-none disabled:opacity-35"
      >
        <Plus size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
