import type { Variants, TargetAndTransition } from "motion/react";

const fadeUpHidden: TargetAndTransition = { opacity: 0, y: 20 };
const fadeUpVisible: TargetAndTransition = { opacity: 1, y: 0 };

export const fadeUp = {
  hidden: fadeUpHidden,
  visible: fadeUpVisible,
} satisfies Variants;

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export const defaultTransition = {
  duration: 0.5,
  ease: [0.25, 0.1, 0.25, 1] as const,
};

export const charReveal = {
  hidden: { y: "100%" },
  visible: { y: "0%" },
} satisfies Variants;

export const charContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.3,
    },
  },
};

export const heroTransition = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1] as const,
};
