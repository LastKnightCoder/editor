import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MdContentCopy,
  MdFormatUnderlined,
  MdHighlight,
  MdWaves,
  MdChat,
} from "react-icons/md";
import type {
  WeReadHighlightStyle,
  WeReadColorStyle,
} from "../../types/elements";
import { wereadColors, highlightStyleNames } from "../../configs";
import useTheme from "@/hooks/useTheme";

interface BookmarkPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement>;
  hasHighlight: boolean;
  hasReview: boolean;
  currentStyle: WeReadHighlightStyle;
  currentColor: WeReadColorStyle;
  onCopy: () => void;
  onStyleChange: (style: WeReadHighlightStyle, color: WeReadColorStyle) => void;
  onOpenReview: () => void;
}

const styleIcons: Record<WeReadHighlightStyle, React.ReactNode> = {
  0: <MdFormatUnderlined size={18} />,
  1: <MdHighlight size={18} />,
  2: <MdWaves size={18} />,
};

export const BookmarkPopover: React.FC<BookmarkPopoverProps> = memo((props) => {
  const {
    isOpen,
    onClose,
    hasHighlight,
    hasReview,
    currentStyle,
    currentColor,
    onCopy,
    onStyleChange,
    onOpenReview,
  } = props;

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedStyle, setSelectedStyle] =
    useState<WeReadHighlightStyle>(currentStyle);

  const handleStyleClick = (style: WeReadHighlightStyle) => {
    setSelectedStyle(style);
    setShowColorPicker(true);
  };

  const handleColorSelect = (color: WeReadColorStyle) => {
    onStyleChange(selectedStyle, color);
    setShowColorPicker(false);
    onClose();
  };

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

              {/* 高亮样式按钮 */}
              {hasHighlight && (
                <>
                  {([0, 1, 2] as WeReadHighlightStyle[]).map((style) => (
                    <motion.button
                      key={style}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleStyleClick(style)}
                      className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
                      style={{
                        color:
                          currentStyle === style
                            ? wereadColors[currentColor]?.[
                                isDark ? "dark" : "light"
                              ]?.textColor || textColor
                            : textColor,
                        backgroundColor:
                          currentStyle === style
                            ? isDark
                              ? "rgba(255,255,255,0.1)"
                              : "rgba(0,0,0,0.05)"
                            : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (currentStyle !== style) {
                          e.currentTarget.style.backgroundColor = hoverBg;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (currentStyle !== style) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                      title={highlightStyleNames[style]}
                    >
                      {styleIcons[style]}
                    </motion.button>
                  ))}

                  <div
                    className="w-px h-5 mx-1"
                    style={{ backgroundColor: borderColor }}
                  />
                </>
              )}

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
                  title="编辑想法"
                >
                  <MdChat size={18} />
                </motion.button>
              )}
            </div>

            {/* 颜色选择器 */}
            <AnimatePresence>
              {showColorPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="p-2 flex gap-2"
                    style={{ borderTop: `1px solid ${borderColor}` }}
                  >
                    {([1, 2, 3, 4, 5] as WeReadColorStyle[]).map((color) => {
                      const colorConfig = wereadColors[color];
                      const colorValue = isDark
                        ? colorConfig.dark.textColor
                        : colorConfig.light.textColor;
                      return (
                        <motion.button
                          key={color}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleColorSelect(color)}
                          className="w-6 h-6 rounded-full border-2 transition-all"
                          style={{
                            backgroundColor: colorValue,
                            borderColor:
                              currentColor === color
                                ? textColor
                                : "transparent",
                          }}
                          title={colorConfig.name}
                        />
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

BookmarkPopover.displayName = "BookmarkPopover";
