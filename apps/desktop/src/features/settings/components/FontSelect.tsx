/**
 * 字体选择器 —— Select 富 label：名称 + 预览句按该字体渲染（触发器与选项同构）。
 * 预览句与字体栈对齐 legacy SettingFontPicker（中文字形 / 拉丁字形 / 等宽字形）。
 */

import { useMemo } from "react";
import { Select } from "@tau/ui";

export type FontKind = "chinese" | "english" | "code";

const FONT_PREVIEW: Record<FontKind, string> = {
  chinese: "春风又绿江南岸",
  english: "Sphinx of black quartz",
  code: "const f = (s) => s;",
};

/** 预览字体栈：目标字体在前，按类别回退到同形制系统字体 */
function previewStack(font: string, kind: FontKind) {
  if (kind === "chinese")
    return `"${font}", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
  if (kind === "code") return `"${font}", "SF Mono", "JetBrains Mono", monospace`;
  return `"${font}", "Helvetica Neue", Arial, sans-serif`;
}

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
  const options = useMemo(() => {
    const list = fonts ?? [];
    const withCurrent = list.includes(value) ? list : [value, ...list];
    return withCurrent.map(f => ({
      value: f,
      searchText: f,
      label: (
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span className="text-tau-sm text-ink-1 truncate">{f}</span>
          <span
            className="text-tau-meta text-ink-3 ml-auto flex-none truncate"
            style={{ fontFamily: previewStack(f, kind) }}
          >
            {FONT_PREVIEW[kind]}
          </span>
        </span>
      ),
    }));
  }, [fonts, value, kind]);

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
