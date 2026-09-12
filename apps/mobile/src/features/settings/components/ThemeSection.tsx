// 主题选择（v2 模板）：2 列迷你预览卡网格 + 跟随系统行。
// 作为 BottomSheet 内容使用（点选即时切换，不关闭面板）。

import { useThemeStore, THEME_OPTIONS, type ThemeMode } from "../../../theme/themeStore";
import { CheckMark } from "./ui";

// 迷你预览：主题底色 + 两根模拟列表条 + 角标圆点
function ThemeSwatch({ bg, bar, accent }: { bg: string; bar: string; accent: string }) {
  return (
    <span
      className="flex h-[72px] flex-col gap-[7px] rounded-[14px] p-[10px]"
      style={{ background: bg }}
    >
      <span className="h-[9px] w-[70%] rounded-full" style={{ background: bar }} />
      <span className="h-[9px] w-[45%] rounded-full" style={{ background: bar }} />
      <span
        className="mt-auto h-[20px] w-[20px] self-end rounded-[7px]"
        style={{ background: accent }}
      />
    </span>
  );
}

const SWATCHES: Record<string, { bg: string; bar: string; accent: string }> = {
  apricot: { bg: "#fffdf9", bar: "#e9e1d2", accent: "#d97757" },
  midnight: { bg: "#171a22", bar: "#262b38", accent: "#f0a860" },
  mint: { bg: "#fbfefb", bar: "#dfe9df", accent: "#4a9d78" },
  ocean: { bg: "#fcfdff", bar: "#dde5ef", accent: "#4d7fc4" },
};

export function ThemeSection() {
  const mode = useThemeStore(state => state.mode);
  const setMode = useThemeStore(state => state.setMode);

  return (
    <div>
      <p className="text-ink-3 mb-3 text-center text-[12px]">点击即时切换整套配色</p>
      <div className="grid grid-cols-2 gap-2.5 pb-1" style={{ paddingTop: 2 }}>
        {THEME_OPTIONS.map(option => {
          const active = mode === option.id;
          const swatch = SWATCHES[option.id];
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={active}
              className={`relative rounded-[18px] p-3 text-left transition-all duration-200 active:scale-[0.96] ${
                active ? "shadow-[inset_0_0_0_2.5px_var(--brand)]" : "shadow-card"
              }`}
              style={{ background: "var(--bg-input)" }}
            >
              {active ? (
                <span
                  className="absolute right-2.5 top-2.5 grid h-[22px] w-[22px] place-items-center rounded-full text-white"
                  style={{ background: "var(--brand)" }}
                >
                  <CheckMark />
                </span>
              ) : null}
              <ThemeSwatch {...swatch} />
              <span className="mt-2 flex items-baseline justify-between">
                <span className="text-ink text-[13.5px] font-bold">{option.label}</span>
                <span className="text-ink-3 text-[11px]">{option.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setMode("system" as ThemeMode)}
        aria-pressed={mode === "system"}
        className={`mt-2.5 flex w-full items-center gap-3 rounded-[18px] px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.98] ${
          mode === "system" ? "shadow-[inset_0_0_0_2px_var(--brand)]" : "shadow-card"
        }`}
        style={{ background: "var(--bg-input)" }}
      >
        <span className="bg-page text-ink-3 shadow-card grid h-8 w-8 place-items-center rounded-[10px] text-[11px] font-bold">
          Aa
        </span>
        <span className="flex-1">
          <span className="text-ink block text-[14.5px] font-bold">跟随系统</span>
          <span className="text-ink-3 mt-0.5 block text-xs">随系统深浅色自动切换</span>
        </span>
        {mode === "system" && <CheckMark />}
      </button>
    </div>
  );
}
