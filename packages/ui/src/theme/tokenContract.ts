/**
 * 语义 token 词汇表 —— 单一事实源。
 *
 * 词汇表同时产出三样东西：
 *  1. TS 类型 SemanticTokens（主题作者必须补齐全部键，漏键编译不过）；
 *  2. CSS 变量名（--tau-<word>，themeStore 注入到 html）；
 *  3. tokens.css 中 @theme inline 的映射依据（颜色类名 = 词汇名）。
 *
 * 规则（见 docs/redesign/02-UI设计系统规范.md §2）：
 *  - 组件只允许消费 --tau-*（或经 Tailwind 映射的语义类名 bg-page / text-ink-1…）；
 *  - palette 原始输入不进组件；尺度（字号/间距/圆角/动效）与主题正交，在 tokens.css :root 定义。
 */

export const tokenContract = {
  surface: ["bg-page", "bg-surface", "bg-surface-hover", "bg-group", "bg-sunken"],
  // 控件部件色（不在表面阶梯里——不受 D-006「沉到 page 之下」约束）：开关/滑杆轨道
  control: ["bg-track"],
  interaction: ["bg-hover", "bg-press", "bg-selected"],
  ink: ["ink-1", "ink-2", "ink-3", "ink-inverse"],
  line: ["line-1", "line-2"],
  accent: ["accent", "accent-hover", "accent-soft", "accent-text", "focus-ring"],
  status: ["ok", "ok-soft", "warn", "warn-soft", "danger", "danger-soft", "info", "info-soft"],
  tag: [
    "tag-1",
    "tag-1-soft",
    "tag-2",
    "tag-2-soft",
    "tag-3",
    "tag-3-soft",
    "tag-4",
    "tag-4-soft",
    "tag-5",
    "tag-5-soft",
  ],
  float: ["overlay", "shadow-card", "shadow-float"],
} as const;

/** 全部词汇的平铺联合类型 */
export type TokenWord = (typeof tokenContract)[keyof typeof tokenContract][number];

/** 主题必须提供的 token 取值表（全键 Required——漏一个编译不过） */
export type SemanticTokens = Record<TokenWord, string>;

/** CSS 变量名约定：--tau-<word>（如 --tau-bg-page）。 */
export function cssVarName(word: string): string {
  return `--tau-${word}`;
}

export const ALL_TOKEN_WORDS: readonly TokenWord[] = Object.values(tokenContract).flat();
