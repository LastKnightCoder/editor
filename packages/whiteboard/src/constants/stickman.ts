import type { StickBody, StickTint } from "../utils/stickman/types";

/** 火柴人墨色与填充：只取主题 token，深浅主题自动跟随 */
export const STICK_INK = "var(--tau-ink-1)";
/** 纸色填充只负责遮挡后面的线（画板、气泡、桌面），与画布底色一致 */
export const STICK_PAPER = "var(--tau-bg-surface)";
export const STICK_MONO_FILL = "color-mix(in srgb, var(--tau-ink-1) 9%, var(--tau-bg-surface))";
export const STICK_WARN_FILL = "color-mix(in srgb, var(--tau-warn) 42%, var(--tau-bg-surface))";
/** 点缀着色：多人场景按人物序号轮换；与纸色混合保证不透明，能遮住身后的线 */
export const STICK_TINTS = ["accent", "tag-2", "tag-1", "tag-3", "tag-4"].map(
  token => `color-mix(in srgb, var(--tau-${token}) 32%, var(--tau-bg-surface))`
);

export const STICK_BODY_OPTIONS: { value: StickBody; label: string }[] = [
  { value: "classic", label: "经典" },
  { value: "bean", label: "豆豆" },
  { value: "glyph", label: "象形" },
];

export const STICK_TINT_OPTIONS: { value: StickTint; label: string }[] = [
  { value: "mono", label: "单色" },
  { value: "color", label: "点缀" },
];

export const DEFAULT_STICK_POSE = "stand";
export const DEFAULT_STICK_BODY: StickBody = "classic";
export const DEFAULT_STICK_TINT: StickTint = "color";

/** 姿态画布四周的留白：道具与墨迹会略微出界 */
export const STICK_PADDING = 6;
