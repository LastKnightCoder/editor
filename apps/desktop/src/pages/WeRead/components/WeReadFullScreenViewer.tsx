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

export const WeReadFullScreenViewer: React.FC<WeReadFullScreenViewerProps> =
  memo((props) => {
    const { open, row, content, onClose } = props;
    const themeColors = useThemeColors();
    // 创建微信读书扩展实例
    const wereadExtensions = useMemo(() => {
      return [
        new WeReadMetadataExtension(),
        new WeReadChapterExtension(),
        new WeReadBookmarkExtension(),
      ];
    }, []);

    if (!open) return null;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={classNames(
          "fixed inset-x-0 bottom-0 z-9999 flex flex-col overflow-hidden",
          "bg-[var(--th-bg-page)]",
        )}
        style={{ top: "var(--title-bar-height, 48px)" }}
        data-testid="weread-fullscreen-viewer"
      >
        {/* Header - 玻璃质感 */}
        <div
          className={classNames(
            "flex items-center px-6 h-16 border-b transition-colors",
            classNames(themeColors.cardBgClass, themeColors.cardBorderClass),
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
