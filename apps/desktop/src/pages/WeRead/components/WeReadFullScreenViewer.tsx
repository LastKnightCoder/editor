import { memo, useMemo } from "react";
import { motion } from "motion/react";
import { MdArrowBack } from "react-icons/md";
import classNames from "classnames";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor/src";
import type { RowData } from "@/components/Database/types";
import {
  WeReadMetadataExtension,
  WeReadChapterExtension,
  WeReadBookmarkExtension,
} from "../extensions";
import useThemeColors from "@/hooks/useThemeColors";
import useBackgroundMode from "@/hooks/useBackgroundMode";

const DEFAULT_DETAIL_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  },
];

interface WeReadFullScreenViewerProps {
  open: boolean;
  row: RowData | null;
  content: Descendant[] | null;
  onClose: () => void;
}

// 渐变背景类名映射 - 与 ContentLayout 保持一致
const gradientClassMap: Record<string, string> = {
  solid: "bg-[var(--primary-bg-color)]",
  gradient1:
    "bg-[radial-gradient(ellipse_at_top_left,#f3f0ff_0%,#faf5ff_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_top_left,#2d1f3d_0%,#1f1530_50%,#15101f_100%)] animate-gradient-shift bg-[length:400%_400%]",
  gradient2:
    "bg-[conic-gradient(from_45deg_at_50%_50%,#e8f4f8_0deg,#f0f9ff_90deg,#e8f4f8_180deg,#d4ebf7_270deg,#e8f4f8_360deg)] dark:bg-[conic-gradient(from_45deg_at_50%_50%,#1a2535_0deg,#152030_90deg,#1a2838_180deg,#0f1a28_270deg,#1a2535_360deg)] animate-gradient-flow bg-[length:400%_400%]",
  gradient3:
    "bg-gradient-to-br from-[#fff5eb] via-[#fffbf0] to-[#fff8f0] dark:from-[#2d1f0f] dark:via-[#251a0a] dark:to-[#1f1505] animate-gradient-dream bg-[length:400%_400%]",
  gradient4:
    "bg-[radial-gradient(ellipse_at_bottom_right,#f0fff4_0%,#f0fdf4_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_bottom_right,#1a2d1f_0%,#152318_50%,#0f1a12_100%)] animate-gradient-shift bg-[length:400%_400%]",
  gradient5:
    "bg-gradient-to-br from-[#fef5f8] via-[#fff0f5] to-[#fffbf5] dark:from-[#2d1a25] dark:via-[#221520] dark:to-[#1a0f15] animate-gradient-dream bg-[length:400%_400%]",
  gradient6:
    "bg-[conic-gradient(from_45deg_at_50%_50%,#f5f5f5_0deg,#fafafa_90deg,#f5f5f5_180deg,#eeeeee_270deg,#f5f5f5_360deg)] dark:bg-[conic-gradient(from_45deg_at_50%_50%,#22222a_0deg,#1a1a22_90deg,#1f1f28_180deg,#151518_270deg,#22222a_360deg)] animate-gradient-flow bg-[length:400%_400%]",
};

export const WeReadFullScreenViewer: React.FC<WeReadFullScreenViewerProps> =
  memo((props) => {
    const { open, row, content, onClose } = props;
    const themeColors = useThemeColors();
    const { backgroundType, isGradient } = useBackgroundMode();

    // 创建微信读书扩展实例
    const wereadExtensions = useMemo(() => {
      return [
        new WeReadMetadataExtension(),
        new WeReadChapterExtension(),
        new WeReadBookmarkExtension(),
      ];
    }, []);

    if (!open) return null;

    const gradientClass =
      gradientClassMap[backgroundType] || gradientClassMap.solid;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={classNames(
          "fixed inset-x-0 bottom-0 z-9999 flex flex-col overflow-hidden",
          gradientClass,
        )}
        style={{ top: "var(--title-bar-height, 48px)" }}
        data-testid="weread-fullscreen-viewer"
      >
        {/* Header - 玻璃质感 */}
        <div
          className={classNames(
            "flex items-center px-6 h-16 border-b transition-colors",
            isGradient
              ? "bg-white/40 dark:bg-black/30 backdrop-blur-xl backdrop-saturate-150 border-white/30 dark:border-white/10"
              : classNames(
                  themeColors.cardBgClass,
                  themeColors.cardBorderClass,
                ),
          )}
        >
          <button
            onClick={onClose}
            className={classNames(
              "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
              themeColors.hoverClass,
              themeColors.activeTextClass,
            )}
          >
            <MdArrowBack size={20} />
            <span className="font-medium">返回</span>
          </button>

          <div
            className={classNames(
              "flex-1 text-center font-medium text-lg truncate mx-4 transition-colors",
              themeColors.activeTextClass,
            )}
          >
            {row?.title || "微信读书笔记"}
          </div>

          {/* Placeholder for symmetry */}
          <div className="w-[88px]"></div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto px-6 py-8">
            <Editor
              key={row?.id}
              initValue={content || DEFAULT_DETAIL_CONTENT}
              extensions={wereadExtensions}
              onChange={() => {
                // Changes are handled in bookmark components
              }}
            />
          </div>
        </div>
      </motion.div>
    );
  });

WeReadFullScreenViewer.displayName = "WeReadFullScreenViewer";
