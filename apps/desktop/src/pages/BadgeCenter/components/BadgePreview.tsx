import { HeartCrack, Trophy } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import { badgeDefaultFailureColor } from "./theme";

export interface BadgePreviewProps {
  name: string;
  icon: string;
  color: string;
  failureColor?: string;
  description: string;
  failureEnabled: boolean;
}

const BadgePreview = ({
  name,
  icon,
  color,
  failureColor = badgeDefaultFailureColor,
  description,
  failureEnabled,
}: BadgePreviewProps) => {
  const themeColors = useThemeColors();
  const hasCustomIcon = icon && icon.length <= 2 && icon.length > 0;

  return (
    <div
      className={`grid gap-4 rounded-3xl border p-5 ${themeColors.borderClass} ${themeColors.tagBgClass}`}
    >
      <div
        className={`text-xs font-medium uppercase tracking-wider ${themeColors.secondaryTextClass}`}
      >
        实时预览
      </div>
      <div className="flex items-center gap-5">
        {/* 成功奖牌 */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 shadow-lg"
            style={{
              borderColor: `${color}55`,
              background: `conic-gradient(from 210deg, ${color}, ${color}cc, ${color}88, ${color})`,
              boxShadow: `inset 0 4px 12px rgba(255,255,255,0.35), 0 8px 24px ${color}44`,
            }}
          >
            <div
              className="absolute inset-2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.45), transparent 60%)",
              }}
            />
            <span className="relative text-xl font-bold text-white drop-shadow">
              {hasCustomIcon ? icon : <Trophy size={22} />}
            </span>
          </div>
          <span className={`text-xs ${themeColors.secondaryTextClass}`}>
            成功
          </span>
        </div>

        {/* 失败奖牌 */}
        {failureEnabled && (
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 shadow-lg"
              style={{
                borderColor: `${failureColor}55`,
                background: `conic-gradient(from 210deg, ${failureColor}, ${failureColor}cc, ${failureColor}88, ${failureColor})`,
                boxShadow: `inset 0 4px 12px rgba(0,0,0,0.5), 0 8px 24px ${failureColor}44`,
              }}
            >
              <div
                className="absolute inset-2 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.3), transparent 60%)",
                }}
              />
              <span className="relative text-xl font-bold text-white">
                <HeartCrack size={22} />
              </span>
            </div>
            <span className={`text-xs ${themeColors.secondaryTextClass}`}>
              失败
            </span>
          </div>
        )}
      </div>

      <div>
        <div className={`text-sm font-semibold ${themeColors.activeTextClass}`}>
          {name || "未命名徽章"}
        </div>
        {description && (
          <div className={`mt-0.5 text-xs ${themeColors.secondaryTextClass}`}>
            {description}
          </div>
        )}
      </div>
    </div>
  );
};

export default BadgePreview;
