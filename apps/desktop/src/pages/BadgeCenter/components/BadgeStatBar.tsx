import { motion } from "motion/react";
import { Award, Flame, HeartCrack, Target } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";

interface StatItem {
  label: string;
  value: number;
  icon: typeof Target;
  accent: string;
}

export interface BadgeStatBarProps {
  definitions: number;
  active: number;
  success: number;
  failure: number;
}

const BadgeStatBar = ({
  definitions,
  active,
  success,
  failure,
}: BadgeStatBarProps) => {
  const themeColors = useThemeColors();
  const items: StatItem[] = [
    {
      label: "目标总数",
      value: definitions,
      icon: Target,
      accent: themeColors.accentColor,
    },
    {
      label: "进行中",
      value: active,
      icon: Flame,
      accent: "#f97316",
    },
    {
      label: "成功徽章",
      value: success,
      icon: Award,
      accent: "#f59e0b",
    },
    {
      label: "失败记录",
      value: failure,
      icon: HeartCrack,
      accent: "#ef4444",
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: index * 0.06,
              type: "spring",
              stiffness: 240,
              damping: 24,
            }}
            className={`rounded-3xl border p-5 backdrop-blur transition ${themeColors.cardBorderClass} ${themeColors.cardBgClass} ${themeColors.hoverBorderClass}`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-medium uppercase tracking-[0.3em] ${themeColors.secondaryTextClass}`}
              >
                {item.label}
              </span>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  backgroundColor: `${item.accent}22`,
                  color: item.accent,
                }}
              >
                <Icon size={15} />
              </div>
            </div>
            <motion.div
              className={`mt-3 text-3xl font-semibold ${themeColors.activeTextClass}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.06 + 0.1 }}
            >
              {item.value}
            </motion.div>
          </motion.div>
        );
      })}
    </section>
  );
};

export default BadgeStatBar;
