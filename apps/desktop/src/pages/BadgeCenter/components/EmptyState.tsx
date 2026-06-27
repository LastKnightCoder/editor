import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import Button from "./Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}

const EmptyState = ({
  title,
  description,
  ctaLabel,
  onCta,
}: EmptyStateProps) => {
  const themeColors = useThemeColors();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed px-6 py-16 text-center ${themeColors.borderClass}`}
    >
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full ${themeColors.tagBgClass}`}
      >
        <Trophy size={32} className={themeColors.secondaryTextClass} />
      </div>
      <div>
        <h3 className={`text-lg font-semibold ${themeColors.activeTextClass}`}>
          {title}
        </h3>
        <p className={`mt-1 text-sm ${themeColors.secondaryTextClass}`}>
          {description}
        </p>
      </div>
      {ctaLabel && onCta && (
        <Button variant="primary" onClick={onCta}>
          {ctaLabel}
        </Button>
      )}
    </motion.div>
  );
};

export default EmptyState;

export const BadgeSkeleton = ({ count = 4 }: { count?: number }) => {
  const themeColors = useThemeColors();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={`h-44 rounded-3xl border animate-pulse ${themeColors.cardBgClass} ${themeColors.cardBorderClass}`}
        />
      ))}
    </div>
  );
};
