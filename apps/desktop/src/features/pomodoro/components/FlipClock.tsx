/**
 * 翻牌时钟（沉浸窗）：每位数字一张牌，只翻变化的那一位。
 * 牌面是中性黑、数字白色，不取主题 token（沉浸窗整页纯黑，不跟随主题色）。
 * 两段式翻页：上半片以牌缝为轴翻下（加速），下半片接着翻上落定（减速），翻动的半片带明暗渐变。
 * 尺寸由容器上的 --ch（牌高）驱动，牌宽 / 字号 / 圆角 / 牌缝都按它折算。
 */

import { Fragment, useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@tau/ui";

const HALF = "absolute inset-x-0 h-1/2 overflow-hidden [backface-visibility:hidden]";
// 牌面：中性黑，上半略亮、下半略暗，在纯黑底上刚好分得出牌的轮廓
const UPPER = cn(
  HALF,
  "top-0 rounded-t-[calc(var(--ch)*0.07)] bg-[linear-gradient(180deg,#1f1f1f,#191919)]"
);
const LOWER = cn(
  HALF,
  "bottom-0 rounded-b-[calc(var(--ch)*0.07)] bg-[linear-gradient(180deg,#141414,#171717)]"
);
const GLYPH = "absolute inset-x-0 h-[var(--ch)] text-center leading-[var(--ch)]";

interface Flip {
  from: string;
  to: string;
  key: number;
}

function FlipDigit({ digit }: { digit: string }) {
  // flip 期间：上半静片显示新数、下半静片仍是旧数，直到下半翻片落定
  const [state, setState] = useState<{ shown: string; flip: Flip | null }>({
    shown: digit,
    flip: null,
  });

  useEffect(() => {
    setState(prev => {
      const current = prev.flip ? prev.flip.to : prev.shown;
      if (digit === current) return prev;
      return { shown: current, flip: { from: current, to: digit, key: (prev.flip?.key ?? 0) + 1 } };
    });
  }, [digit]);

  const { flip, shown } = state;
  const upper = flip ? flip.to : shown;
  const lower = flip ? flip.from : shown;
  const settle = (key: number) =>
    setState(prev => (prev.flip?.key === key ? { shown: prev.flip.to, flip: null } : prev));

  return (
    <div className="relative h-[var(--ch)] w-[calc(var(--ch)*0.7)] [perspective:calc(var(--ch)*3.2)]">
      <div className={UPPER}>
        <span className={cn(GLYPH, "top-0")}>{upper}</span>
      </div>
      <div className={LOWER}>
        <span className={cn(GLYPH, "top-[calc(var(--ch)*-0.5)]")}>{lower}</span>
      </div>
      {flip && (
        <Fragment key={flip.key}>
          <motion.div
            className={cn(UPPER, "z-[3] origin-bottom")}
            initial={{ rotateX: 0 }}
            animate={{ rotateX: -90 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.9, 0.6] }}
          >
            <span className={cn(GLYPH, "top-0")}>{flip.from}</span>
            <motion.i
              className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.28 }}
            />
          </motion.div>
          <motion.div
            className={cn(LOWER, "z-[4] origin-top")}
            initial={{ rotateX: 90 }}
            animate={{ rotateX: 0 }}
            transition={{ duration: 0.32, delay: 0.27, ease: [0.1, 0.5, 0.3, 1] }}
            onAnimationComplete={() => settle(flip.key)}
          >
            <span className={cn(GLYPH, "top-[calc(var(--ch)*-0.5)]")}>{flip.to}</span>
            <motion.i
              className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.32, delay: 0.27 }}
            />
          </motion.div>
        </Fragment>
      )}
      {/* 牌缝：纯黑细缝 + 两侧铰链缺口 */}
      <i
        aria-hidden
        className="absolute inset-x-0 top-1/2 z-[5] -mt-px h-[max(2px,calc(var(--ch)*0.012))] bg-black"
      />
      <i
        aria-hidden
        className="absolute -left-px top-1/2 z-[6] h-[calc(var(--ch)*0.05)] w-[calc(var(--ch)*0.03)] -translate-y-1/2 bg-black"
      />
      <i
        aria-hidden
        className="absolute -right-px top-1/2 z-[6] h-[calc(var(--ch)*0.05)] w-[calc(var(--ch)*0.03)] -translate-y-1/2 bg-black"
      />
    </div>
  );
}

/** time 形如 "25:00" / "1:05:09"；段数或位数变化时整体重建 */
export function FlipClock({
  time,
  dimmed,
  className,
}: {
  time: string;
  dimmed?: boolean;
  className?: string;
}) {
  const groups = time.split(":");
  return (
    <div
      role="timer"
      aria-label={time}
      className={cn(
        "flex items-center gap-[calc(var(--ch)*0.07)] text-[length:calc(var(--ch)*0.8)] font-semibold tabular-nums tracking-[-0.02em] transition-colors duration-500",
        dimmed ? "text-white/40" : "text-white",
        className
      )}
    >
      {groups.map((group, gi) => (
        <Fragment key={`${groups.length}-${gi}-${group.length}`}>
          {gi > 0 && (
            <span
              aria-hidden
              className="flex flex-col gap-[calc(var(--ch)*0.2)] px-[calc(var(--ch)*0.03)]"
            >
              <i className="size-[calc(var(--ch)*0.055)] rounded-[22%] bg-white/20" />
              <i className="size-[calc(var(--ch)*0.055)] rounded-[22%] bg-white/20" />
            </span>
          )}
          <span className="flex gap-[calc(var(--ch)*0.045)]">
            {[...group].map((d, di) => (
              <FlipDigit key={di} digit={d} />
            ))}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
