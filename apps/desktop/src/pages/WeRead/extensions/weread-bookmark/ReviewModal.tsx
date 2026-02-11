import { memo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MdClose, MdCheck } from "react-icons/md";
import type { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme";
import { ReviewEditor } from "./ReviewEditor";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent: Descendant[];
  markText: string;
  onSave: (content: Descendant[]) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const ReviewModal: React.FC<ReviewModalProps> = memo((props) => {
  const { isOpen, onClose, initialContent, markText, onSave, containerRef } =
    props;
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [content, setContent] = useState<Descendant[]>(initialContent);
  const [containerBottom, setContainerBottom] = useState(0);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerBottom(window.innerHeight - rect.bottom);
    }
  }, [isOpen, containerRef]);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleSave = useMemoizedFn(() => {
    onSave(content);
    onClose();
  });

  const handleContentChange = useMemoizedFn((newContent: Descendant[]) => {
    setContent(newContent);
  });

  const bgColor = isDark ? "#1f1f1f" : "#ffffff";
  const borderColor = isDark ? "#404040" : "#e5e5e5";
  const textColor = isDark ? "#e5e5e5" : "#262626";
  const quoteBg = isDark ? "#2a2a2a" : "#f5f5f5";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={onClose}
          />

          {/* Modal - 固定在笔记容器下方 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed left-1/2 z-50 w-full max-w-lg px-4"
            style={{
              bottom: Math.max(containerBottom + 16, 16),
              transform: "translateX(-50%)",
            }}
          >
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                boxShadow: isDark
                  ? "0 8px 32px rgba(0, 0, 0, 0.5)"
                  : "0 8px 32px rgba(0, 0, 0, 0.15)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `1px solid ${borderColor}` }}
              >
                <span className="font-medium" style={{ color: textColor }}>
                  编辑想法
                </span>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onClose}
                    className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                    style={{ color: isDark ? "#a3a3a3" : "#737373" }}
                  >
                    <MdClose size={20} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSave}
                    className="flex items-center justify-center px-3 h-8 rounded-lg font-medium transition-colors"
                    style={{
                      backgroundColor: isDark ? "#3b82f6" : "#2563eb",
                      color: "#ffffff",
                    }}
                  >
                    <MdCheck size={18} className="mr-1" />
                    确定
                  </motion.button>
                </div>
              </div>

              {/* 引用文本 */}
              <div
                className="px-4 py-3 text-sm"
                style={{
                  backgroundColor: quoteBg,
                  color: isDark ? "#a3a3a3" : "#737373",
                  borderBottom: `1px solid ${borderColor}`,
                }}
              >
                <div className="line-clamp-2">{markText}</div>
              </div>

              {/* 编辑器 */}
              <div className="p-4">
                <ReviewEditor
                  content={content}
                  onSave={handleContentChange}
                  readOnly={false}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

ReviewModal.displayName = "ReviewModal";
