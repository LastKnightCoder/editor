import { motion } from "motion/react";
import { HeartCrack, Trophy } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import type { BadgeAward, BadgeDefinition } from "@/types";
import { formatPeriodKey, getAwardDesign } from "./theme";

export interface BadgeMedalProps {
  award: BadgeAward;
  definition?: BadgeDefinition;
  onClick?: () => void;
  index?: number;
}

const BadgeMedal = ({
  award,
  definition,
  onClick,
  index = 0,
}: BadgeMedalProps) => {
  const themeColors = useThemeColors();
  const isFailure = award.awardKind === "failure";
  const design = getAwardDesign(definition, award);
  const accent = design.color;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.9 }}
      transition={{
        delay: index * 0.04,
        type: "spring",
        stiffness: 260,
        damping: 22,
      }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl border p-6 text-center backdrop-blur transition ${themeColors.cardBorderClass} ${themeColors.cardBgClass}`}
    >
      {/* 光晕背景 */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full opacity-30 blur-3xl transition group-hover:opacity-60"
        style={{ backgroundColor: isFailure ? "#7f1d1d" : accent }}
      />

      {/* 奖牌本体 */}
      <div className="relative">
        <motion.div
          className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 shadow-lg`}
          style={{
            borderColor: isFailure ? "#7f1d1d55" : `${accent}55`,
            background: isFailure
              ? "conic-gradient(from 210deg, #1f2937, #374151, #1f2937)"
              : `conic-gradient(from 210deg, ${accent}, ${accent}cc, ${accent}88, ${accent})`,
            boxShadow: isFailure
              ? "inset 0 4px 12px rgba(0,0,0,0.5)"
              : `inset 0 4px 12px rgba(255,255,255,0.35), 0 8px 24px ${accent}44`,
          }}
          animate={isFailure ? {} : { y: [0, -3, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* 内圈高光 */}
          <div
            className="absolute inset-2 rounded-full"
            style={{
              background: isFailure
                ? "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.08), transparent 60%)"
                : "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.45), transparent 60%)",
            }}
          />
          {/* 图标 */}
          <span className="relative text-2xl font-bold text-white drop-shadow">
            {design.icon ||
              (isFailure ? <HeartCrack size={26} /> : <Trophy size={26} />)}
          </span>
          {/* 失败裂纹 */}
          {isFailure && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 96 96"
              fill="none"
            >
              <path
                d="M48 6 L40 40 L52 44 L42 70 L50 92"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M52 44 L64 52"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </motion.div>
      </div>

      {/* 文案 */}
      <div className="relative w-full">
        <div className={`text-sm font-semibold ${themeColors.activeTextClass}`}>
          {design.title}
        </div>
        {design.description && (
          <div
            className={`mt-1 line-clamp-2 text-xs ${themeColors.secondaryTextClass}`}
          >
            {design.description}
          </div>
        )}
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-1 font-medium ${
              isFailure
                ? "bg-red-500/15 text-red-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {isFailure ? "未达成" : "已达成"}
          </span>
          <span className={`${themeColors.secondaryTextClass}`}>
            {award.progressValue}/{award.targetValue} ·{" "}
            {formatPeriodKey(award.periodKey)}
          </span>
        </div>
      </div>
    </motion.button>
  );
};

export default BadgeMedal;
