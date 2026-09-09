import type { TransitionConfig, TransitionPreset } from "./core/pageMeta";

// 转场目标值：结构兼容 motion 的 TargetAndTransition（x/y/transition 子集）
export type ScreenMotionTarget = {
  x?: string | number;
  y?: string | number;
  transition?: {
    duration?: number;
    ease?: [number, number, number, number];
  };
};

export type ScreenEnterMotion = {
  initial: false | ScreenMotionTarget;
  animate: ScreenMotionTarget;
};
export type ScreenExitMotion = {
  exit: ScreenMotionTarget;
};

// push 时下层页面的视差位移比例（对齐原生栈式导航的观感）
export const SCREEN_PARALLAX_RATIO = 0.25;

const ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1];

const NO_ENTER: ScreenEnterMotion = { initial: false, animate: { x: 0, y: 0 } };
const NO_EXIT: ScreenExitMotion = { exit: { x: 0, y: 0 } };

function toSeconds(ms: number): number {
  return Math.max(ms, 0) / 1000;
}

// 仅 slideRight 转场会推动下层页面做视差；sheetUp/none 下层保持不动
export function shouldParallaxUnderlay(preset: TransitionPreset | undefined): boolean {
  return preset === "slideRight";
}

export function resolveScreenEnterMotion(
  transition?: TransitionConfig,
  reducedMotion = false
): ScreenEnterMotion {
  if (!transition || reducedMotion || transition.preset === "none") {
    return NO_ENTER;
  }

  if (transition.preset === "sheetUp") {
    return {
      initial: { y: "100%" },
      animate: {
        y: 0,
        transition: {
          duration: toSeconds(transition.enterMs),
          ease: ENTER_EASE,
        },
      },
    };
  }

  return {
    initial: { x: "100%" },
    animate: {
      x: 0,
      transition: {
        duration: toSeconds(transition.enterMs),
        ease: ENTER_EASE,
      },
    },
  };
}

export function resolveScreenExitMotion(
  transition?: TransitionConfig,
  reducedMotion = false
): ScreenExitMotion {
  if (!transition || reducedMotion || transition.preset === "none") {
    return NO_EXIT;
  }

  if (transition.preset === "sheetUp") {
    return {
      exit: {
        y: "100%",
        transition: {
          duration: toSeconds(transition.exitMs),
          ease: EXIT_EASE,
        },
      },
    };
  }

  return {
    exit: {
      x: "100%",
      transition: {
        duration: toSeconds(transition.exitMs),
        ease: EXIT_EASE,
      },
    },
  };
}
