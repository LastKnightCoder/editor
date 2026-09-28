import { memo } from "react";
import { getWeReadKit } from "../extensions";
import { motion } from "motion/react";
import { MdArrowBack } from "react-icons/md";
import classNames from "classnames";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor/src";
import type { RowData } from "@/components/Database/types";
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

export const WeReadFullScreenViewer: React.FC<WeReadFullScreenViewerProps> = memo(props => {
  const { open, row, content, onClose } = props;
  const themeColors = useThemeColors();

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={classNames(
        "z-9999 fixed inset-x-0 bottom-0 flex flex-col overflow-hidden",
        "bg-[var(--th-bg-page)]"
      )}
      style={{ top: "var(--title-bar-height, 48px)" }}
      data-testid="weread-fullscreen-viewer"
    >
      {/* Header - 玻璃质感 */}
      <div
        className={classNames(
          "flex h-16 items-center border-b px-6 transition-colors",
          classNames(themeColors.cardBgClass, themeColors.cardBorderClass)
        )}
      >
        <button
          onClick={onClose}
          className={classNames(
            "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
            themeColors.hoverClass,
            themeColors.activeTextClass
          )}
        >
          <MdArrowBack size={20} />
          <span className="font-medium">返回</span>
        </button>

        <div
          className={classNames(
            "mx-4 flex-1 truncate text-center text-lg font-medium transition-colors",
            themeColors.activeTextClass
          )}
        >
          {row?.title || "微信读书笔记"}
        </div>

        {/* Placeholder for symmetry */}
        <div className="w-[88px]"></div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Editor
            kit={getWeReadKit()}
            key={row?.id}
            initValue={content || DEFAULT_DETAIL_CONTENT}
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
