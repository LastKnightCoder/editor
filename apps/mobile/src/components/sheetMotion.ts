// 底部面板两种形态的进出动效：紧凑档从底部滑出，中等与宽档居中淡入。

export const SHEET_UP_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { type: "spring", damping: 26, stiffness: 300, mass: 0.9 },
} as const;

export const CENTERED_SHEET_MOTION = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
} as const;

/**
 * 居中卡片的定位：水平居中在导航条右侧的页面区域，垂直居中在键盘以上的可见区，
 * 宽度封顶 520。位移交给 motion 的 x / y，避免与缩放动画的 transform 互相覆盖。
 */
export const CENTERED_SHEET_CLASS =
  "bg-surface shadow-float absolute left-[calc(50%+var(--screen-inset-left)/2)] top-[calc(var(--kb-viewport-top)+var(--kb-viewport-height)/2)] w-[min(520px,calc(100%-var(--screen-inset-left)-48px))] rounded-[24px]";

export const CENTERED_SHEET_STYLE = { x: "-50%", y: "-50%" } as const;
