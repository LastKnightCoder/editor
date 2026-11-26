import { useAppearanceI18n } from "../appearanceI18n";
/**
 * 字体选择器 —— Select 富 label：名称 + 预览句按该字体渲染（触发器与选项同构）。
 * 预览句与字体栈对齐 legacy SettingFontPicker（中文字形 / 拉丁字形 / 等宽字形）。
 */

import { useMemo } from "react";
import { Select } from "@tau/ui";
import { BUNDLED_FONTS, resolveFontStack } from "@/utils/bundled-fonts";

export type FontKind = "chinese" | "english" | "code";

const FONT_PREVIEW: Record<FontKind, string> = {
  chinese: "春风又绿江南岸",
  english: "Sphinx of black quartz",
  code: "const f = (s) => s;",
};

export function FontSelect({
  kind,
  value,
  fonts,
  onChange,
  "aria-label": ariaLabel,
}: {
  kind: FontKind;
  value: string;
  fonts: string[] | undefined;
  onChange: (font: string) => void;
  "aria-label"?: string;
}) {
  const { t, locale } = useAppearanceI18n();
  const systemDefault = t("font.default");
  const bundledLabel = t("font.bundled");
  const preview = kind === "chinese" && locale === "zh-TW" ? "春風又綠江南岸" : FONT_PREVIEW[kind];
  const options = useMemo(() => {
    const bundled = BUNDLED_FONTS.filter(font => font.kind === kind).map(font => font.name);
    const list = [...new Set([...bundled, ...(fonts ?? [])])];
    if (value && !list.includes(value)) list.unshift(value);
    return ["", ...list.filter(Boolean)].map(f => ({
      value: f,
      searchText: f || systemDefault,
      label: (
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span className="text-tau-sm text-ink-1 truncate">
            {f || systemDefault}
            {BUNDLED_FONTS.some(font => font.name === f) && bundledLabel}
          </span>
          <span
            className="text-tau-meta text-ink-3 ml-auto flex-none truncate"
            style={{ fontFamily: resolveFontStack(kind === "code" ? "code" : "text", f) }}
          >
            {preview}
          </span>
        </span>
      ),
    }));
  }, [fonts, value, kind, systemDefault, bundledLabel, preview]);

  return (
    <Select
      aria-label={ariaLabel}
      className="w-[300px]"
      searchable
      value={value}
      options={options}
      onValueChange={v => onChange(v as string)}
    />
  );
}
