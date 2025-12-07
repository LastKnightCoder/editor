import { AnimatePresence, motion } from "framer-motion";
import { SlideAnimation } from "@/types/slide";

interface SlideAnimationLayerProps {
  animations: SlideAnimation[];
  visibleCount: number;
}

const getMotionConfig = (animation: SlideAnimation) => {
  const effect = animation.effect?.type ?? "fade";
  const direction = animation.effect?.direction ?? "up";
  const durationRaw = animation.effect?.duration ?? 0;
  const duration = durationRaw > 0 ? durationRaw / 1000 : 0.45;
  const delayRaw = animation.effect?.delay ?? 0;
  const delay = delayRaw > 0 ? delayRaw / 1000 : 0;
  const easing = animation.effect?.easing ?? "ease-out";

  const baseTransition = {
    duration,
    delay,
    ease:
      easing === "linear"
        ? "linear"
        : easing === "ease-in"
          ? "easeIn"
          : easing === "ease-in-out"
            ? "easeInOut"
            : easing === "ease-out"
              ? "easeOut"
              : "ease",
  } as const;

  switch (effect) {
    case "slide": {
      const distance = 40;
      const axis = direction === "left" || direction === "right" ? "x" : "y";
      const value =
        direction === "left" || direction === "up" ? distance : -distance;
      const initial = {
        opacity: 0,
        x: axis === "x" ? value : 0,
        y: axis === "y" ? value : 0,
      };
      return {
        initial,
        animate: { opacity: 1, x: 0, y: 0 },
        exit: { opacity: 0, x: -initial.x, y: -initial.y },
        transition: baseTransition,
      };
    }
    case "zoom": {
      return {
        initial: { opacity: 0, scale: 0.85 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.85 },
        transition: { ...baseTransition, type: "tween" as const },
      };
    }
    case "bounce": {
      return {
        initial: { opacity: 0, scale: 0.8 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.8 },
        transition: {
          ...baseTransition,
          type: "spring",
          bounce: 0.35,
        } as const,
      };
    }
    case "none": {
      return {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0.8 },
        transition: baseTransition,
      };
    }
    case "fade":
    default: {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: baseTransition,
      };
    }
  }
};

const SlideAnimationLayer = ({
  animations,
  visibleCount,
}: SlideAnimationLayerProps) => {
  const entries = animations.map((step, index) => ({ step, index }));
  const visibleEntries = entries.slice(0, visibleCount);

  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none flex items-start justify-start p-6">
      <div className="flex flex-col gap-3 max-w-[420px]">
        <AnimatePresence initial={false}>
          {visibleEntries.map(({ step, index }) => {
            const motionConfig = getMotionConfig(step);
            return (
              <motion.div
                key={step.id}
                {...motionConfig}
                layout
                className="rounded-2xl bg-white/80 dark:bg-slate-900/80 px-4 py-3 shadow-2xl backdrop-blur border border-white/50 dark:border-slate-700/60"
              >
                <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  动画 {index + 1}
                </div>
                <div className="text-base font-semibold text-slate-900 dark:text-white mt-1">
                  {step.label || `动画步骤 ${index + 1}`}
                </div>
                {step.description ? (
                  <div className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {step.description}
                  </div>
                ) : null}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SlideAnimationLayer;
