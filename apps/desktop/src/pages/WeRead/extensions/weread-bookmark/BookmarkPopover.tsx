import { memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MdContentCopy, MdChat } from "react-icons/md";
import useTheme from "@/hooks/useTheme";

interface BookmarkPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  hasReview: boolean;
  onCopy: () => void;
  onOpenReview: () => void;
}

export const BookmarkPopover: React.FC<BookmarkPopoverProps> = memo((props) => {
  const { isOpen, onClose, hasReview, onCopy, onOpenReview } = props;

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const bgColor = isDark ? "#2a2a2a" : "#ffffff";
  const borderColor = isDark ? "#404040" : "#e5e5e5";
  const hoverBg = isDark ? "#3a3a3a" : "#f5f5f5";
  const textColor = isDark ? "#e5e5e5" : "#262626";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          {/* Popover */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 left-0 top-0"
            style={{
              marginTop: "-48px",
              backgroundColor: bgColor,
              border: `1px solid ${borderColor}`,
              borderRadius: "8px",
              boxShadow: isDark
                ? "0 4px 20px rgba(0, 0, 0, 0.4)"
                : "0 4px 20px rgba(0, 0, 0, 0.15)",
            }}
          >
            <div className="flex items-center gap-1 p-1">
              {/* 复制按钮 */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  onCopy();
                  onClose();
                }}
                className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
                style={{ color: textColor }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = hoverBg)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
                title="复制"
              >
                <MdContentCopy size={18} />
              </motion.button>

              {/* 分隔线 */}
              <div
                className="w-px h-5 mx-1"
                style={{ backgroundColor: borderColor }}
              />

              {/* 想法按钮 */}
              {hasReview && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    onOpenReview();
                    onClose();
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
                  style={{ color: textColor }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = hoverBg)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  title="查看想法"
                >
                  <MdChat size={18} />
                </motion.button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

BookmarkPopover.displayName = "BookmarkPopover";
