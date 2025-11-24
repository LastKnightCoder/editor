import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { MdArrowBack } from "react-icons/md";
import type { Descendant } from "slate";
import Editor from "@/components/Editor";
import type { RowData } from "@/components/Database/types";
import {
  WeReadMetadataExtension,
  WeReadChapterExtension,
  WeReadBookmarkExtension,
} from "../extensions";
import useTheme from "@/hooks/useTheme";

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
    const { theme } = useTheme();
    const isDark = theme === "dark";

    // 创建微信读书扩展实例
    const wereadExtensions = useMemo(() => {
      return [
        new WeReadMetadataExtension(),
        new WeReadChapterExtension(),
        new WeReadBookmarkExtension(),
      ];
    }, []);

    if (!open) return null;

    const bgColor = isDark ? "#0f0f0f" : "#ffffff";
    const headerBg = isDark ? "#1a1a1a" : "#f8f9fa";
    const borderColor = isDark ? "#2a2a2a" : "#e5e7eb";
    const textColor = isDark ? "#e5e5e5" : "#1f2937";

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999] flex flex-col"
        style={{ backgroundColor: bgColor }}
      >
        {/* Header */}
        <div
          className="flex items-center px-6 h-16 border-b"
          style={{
            backgroundColor: headerBg,
            borderColor: borderColor,
          }}
        >
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-opacity-80"
            style={{
              color: textColor,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.05)",
            }}
          >
            <MdArrowBack size={20} />
            <span className="font-medium">返回</span>
          </button>

          <div
            className="flex-1 text-center font-medium text-lg truncate mx-4"
            style={{ color: textColor }}
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
