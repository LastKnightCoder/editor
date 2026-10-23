// 主题选择：与桌面外观设置同构的两个正交维度——明暗（跟随系统 / 浅色 / 深色）× 主题族。
// 作为 BottomSheet 内容使用（点选即时切换，不关闭面板）；预览色直接读各主题的 token。

import type { CSSProperties, ReactNode } from "react";
import {
  DEFAULT_THEME_KEY,
  getTheme,
  listThemes,
  type Appearance,
  type SemanticTokens,
  type ThemeDefinition,
} from "@tau/themes";
import { useThemeStore } from "@tau/themes/react";
import { GroupLabel } from "../../../components/GroupLabel";

const APPEARANCE_OPTIONS: Array<{ value: Appearance; caption: string }> = [
  { value: "system", caption: "跟随系统" },
  { value: "light", caption: "浅色" },
  { value: "dark", caption: "深色" },
];

const pageStyle = (t: SemanticTokens): CSSProperties => ({ background: t["bg-page"] });
const cardStyle = (t: SemanticTokens): CSSProperties => ({ background: t["bg-surface"] });
const barStyle = (t: SemanticTokens): CSSProperties => ({ background: t["line-1"] });

/** 单套配色的迷你手机屏：卡片 + 两根文字条 + accent 按钮（选中时点亮） */
function ScreenPreview({ tokens, lit }: { tokens: SemanticTokens; lit: boolean }) {
  return (
    <span className="flex h-full flex-col gap-[6px] p-[8px]" style={pageStyle(tokens)}>
      <span
        className="flex flex-1 flex-col gap-[5px] rounded-[8px] p-[7px]"
        style={cardStyle(tokens)}
      >
        <span className="h-[6px] w-[70%] rounded-full" style={barStyle(tokens)} />
        <span className="h-[6px] w-[45%] rounded-full" style={barStyle(tokens)} />
      </span>
      <span
        className="h-[10px] w-[40%] self-end rounded-full transition-colors duration-200"
        style={{ background: lit ? tokens.accent : tokens["line-1"] }}
      />
    </span>
  );
}

/** 深浅分屏：左浅右深，各画该主题族的一套迷你屏 */
function SplitPreview({ theme, lit }: { theme: ThemeDefinition; lit: boolean }) {
  return (
    <span className="grid h-full grid-cols-2">
      <ScreenPreview tokens={theme.light.tokens} lit={lit} />
      <ScreenPreview tokens={theme.dark.tokens} lit={lit} />
    </span>
  );
}

function ChoiceCard(props: {
  active: boolean;
  caption: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      aria-pressed={props.active}
      className={`bg-surface rounded-[16px] p-2 text-left transition-transform duration-200 active:scale-[0.96] ${
        props.active ? "shadow-[inset_0_0_0_2px_var(--tau-accent)]" : "shadow-card"
      }`}
    >
      <span className="block h-[68px] overflow-hidden rounded-[10px]">{props.children}</span>
      <span
        className={`mt-1.5 block text-center text-[12.5px] font-bold ${
          props.active ? "text-accent-text" : "text-ink-2"
        }`}
      >
        {props.caption}
      </span>
    </button>
  );
}

export function ThemeSection() {
  const themeKey = useThemeStore(s => s.theme);
  const appearance = useThemeStore(s => s.appearance);
  const setTheme = useThemeStore(s => s.setTheme);
  const setAppearance = useThemeStore(s => s.setAppearance);
  const currentTheme = getTheme(themeKey) ?? getTheme(DEFAULT_THEME_KEY)!;

  return (
    <div className="pb-1">
      <GroupLabel inset="sheet">明暗</GroupLabel>
      <div className="grid grid-cols-3 gap-2.5">
        {APPEARANCE_OPTIONS.map(option => (
          <ChoiceCard
            key={option.value}
            active={appearance === option.value}
            caption={option.caption}
            onSelect={() => setAppearance(option.value)}
          >
            {option.value === "system" ? (
              <SplitPreview theme={currentTheme} lit={appearance === "system"} />
            ) : (
              <ScreenPreview
                tokens={currentTheme[option.value].tokens}
                lit={appearance === option.value}
              />
            )}
          </ChoiceCard>
        ))}
      </div>

      <GroupLabel inset="sheet">主题</GroupLabel>
      <div className="grid grid-cols-3 gap-2.5">
        {listThemes().map(theme => (
          <ChoiceCard
            key={theme.key}
            active={theme.key === currentTheme.key}
            caption={theme.name}
            onSelect={() => setTheme(theme.key)}
          >
            <SplitPreview theme={theme} lit={theme.key === currentTheme.key} />
          </ChoiceCard>
        ))}
      </div>
      <p className="text-ink-3 mt-3 text-center text-[12px]">每套主题都包含深浅两套配色</p>
    </div>
  );
}
