import type { PageTransitionConfig } from "./types";
import type { ComponentProps } from "react";
import { motion } from "motion/react";

export type ScreenMotionProps = Pick<
  ComponentProps<typeof motion.div>,
  "initial" | "animate" | "exit"
>;

const NO_MOTION: ScreenMotionProps = {
  initial: false,
  animate: {
    opacity: 1,
  },
  exit: {
    opacity: 1,
  },
};

function toSeconds(ms: number): number {
  return Math.max(ms, 0) / 1000;
}

export function resolveScreenMotion(
  transition?: PageTransitionConfig,
  reducedMotion = false,
): ScreenMotionProps {
  if (!transition) {
    return NO_MOTION;
  }

  if (reducedMotion || transition.preset === "none") {
    return {
      ...NO_MOTION,
      animate: {
        opacity: 1,
        transition: { duration: toSeconds(transition.enterMs) },
      },
      exit: {
        opacity: 1,
        transition: { duration: toSeconds(transition.exitMs) },
      },
    };
  }

  if (transition.preset === "sheetUp") {
    return {
      initial: {
        opacity: 0,
        y: "100%",
      },
      animate: {
        opacity: 1,
        y: 0,
        transition: {
          duration: toSeconds(transition.enterMs),
          ease: [0.22, 1, 0.36, 1],
        },
      },
      exit: {
        opacity: 0,
        y: "100%",
        transition: {
          duration: toSeconds(transition.exitMs),
          ease: [0.4, 0, 1, 1],
        },
      },
    };
  }

  if (transition.preset === "slideRight") {
    return {
      initial: {
        opacity: 0,
        x: "20%",
      },
      animate: {
        opacity: 1,
        x: 0,
        transition: {
          duration: toSeconds(transition.enterMs),
          ease: [0.22, 1, 0.36, 1],
        },
      },
      exit: {
        opacity: 0,
        x: "20%",
        transition: {
          duration: toSeconds(transition.exitMs),
          ease: [0.4, 0, 1, 1],
        },
      },
    };
  }

  return NO_MOTION;
}
