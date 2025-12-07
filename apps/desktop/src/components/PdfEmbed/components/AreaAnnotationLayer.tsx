import { useCallback, useState, useEffect } from "react";
import classNames from "classnames";
import {
  StickyNote as StickyNoteIcon,
  Trash2 as TrashIcon,
} from "lucide-react";
import type { PdfAnnotation, EHighlightColor } from "@/types";
import useThemeColors from "@/hooks/useThemeColors";
import { HIGHLIGHT_COLORS } from "../constants";

// 将十六进制颜色转换为带透明度的 rgba 字符串
const hexToRgba = (hex: string, alpha: number) => {
  const raw = hex.replace("#", "");
  let r = 0,
    g = 0,
    b = 0;
  if (raw.length === 3) {
    r = parseInt(raw[0] + raw[0], 16);
    g = parseInt(raw[1] + raw[1], 16);
    b = parseInt(raw[2] + raw[2], 16);
  } else if (raw.length === 6) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  } else {
    // 非法 hex，退回默认色
    return `rgba(78, 141, 242, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// 默认系统强调色（与样式中一致）的透明度版本
const accentRgba = (alpha: number) => `rgba(78, 141, 242, ${alpha})`;

interface AreaAnnotationLayerProps {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  annotations: PdfAnnotation[];
  selectedAnnotationId: number | null;
  onSelect: (annotation: PdfAnnotation) => void;
  onColorChange: (annotation: PdfAnnotation, color: EHighlightColor) => void;
  onAddNote: (annotation: PdfAnnotation) => void;
  onDelete: (annotation: PdfAnnotation) => void;
}

const AreaAnnotationLayer = ({
  pageIndex,
  scale,
  annotations,
  selectedAnnotationId,
  onSelect,
  onColorChange,
  onAddNote,
  onDelete,
}: AreaAnnotationLayerProps) => {
  const [menuAnnotation, setMenuAnnotation] = useState<PdfAnnotation | null>(
    null,
  );

  // 当 selectedAnnotationId 变为 null 时，同步关闭菜单
  useEffect(() => {
    if (selectedAnnotationId === null) {
      setMenuAnnotation(null);
    }
  }, [selectedAnnotationId]);

  // 过滤当前页面的区域标注
  const pageAnnotations = annotations.filter(
    (anno) => anno.type === "area" && anno.areaData?.pageIndex === pageIndex,
  );

  const handleClick = useCallback(
    (e: React.MouseEvent, annotation: PdfAnnotation) => {
      e.stopPropagation();
      onSelect(annotation);
      setMenuAnnotation(annotation);
    },
    [onSelect],
  );

  const handleCloseMenu = useCallback(() => {
    setMenuAnnotation(null);
  }, []);

  const handleColorChange = useCallback(
    (annotation: PdfAnnotation, color: EHighlightColor) => {
      onColorChange(annotation, color);
    },
    [onColorChange],
  );

  if (pageAnnotations.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-1">
      {pageAnnotations.map((annotation) => {
        const { areaData, color } = annotation;
        if (!areaData) return null;

        const { rect } = areaData;
        const isSelected = selectedAnnotationId === annotation.id;
        const borderColor = color
          ? HIGHLIGHT_COLORS[color]
          : "var(--pdf-accent)";
        // 背景色：有颜色时使用对应颜色的浅色透明版本，否则使用默认强调色
        const bgAlpha = isSelected ? 0.25 : 0.12;
        const backgroundColor = color
          ? hexToRgba(HIGHLIGHT_COLORS[color], bgAlpha)
          : accentRgba(bgAlpha);

        return (
          <div
            key={annotation.id}
            className={classNames(
              "absolute pointer-events-auto border-2 rounded cursor-pointer transition-all",
            )}
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.width * scale,
              height: rect.height * scale,
              borderColor,
              backgroundColor,
            }}
            onClick={(e) => handleClick(e, annotation)}
          />
        );
      })}

      {/* 区域标注菜单 */}
      {menuAnnotation && menuAnnotation.areaData && (
        <AreaAnnotationMenu
          annotation={menuAnnotation}
          scale={scale}
          onColorChange={handleColorChange}
          onAddNote={onAddNote}
          onDelete={onDelete}
          onClose={handleCloseMenu}
        />
      )}
    </div>
  );
};

// 区域标注菜单组件
interface AreaAnnotationMenuProps {
  annotation: PdfAnnotation;
  scale: number;
  onColorChange: (annotation: PdfAnnotation, color: EHighlightColor) => void;
  onAddNote: (annotation: PdfAnnotation) => void;
  onDelete: (annotation: PdfAnnotation) => void;
  onClose: () => void;
}

const AreaAnnotationMenu = ({
  annotation,
  scale,
  onColorChange,
  onAddNote,
  onDelete,
  onClose,
}: AreaAnnotationMenuProps) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const themeColors = useThemeColors();
  const { areaData, color } = annotation;

  if (!areaData) return null;

  const { rect } = areaData;
  const menuLeft = rect.x * scale + (rect.width * scale) / 2;
  const menuTop = rect.y * scale;

  const currentColor = color
    ? HIGHLIGHT_COLORS[color]
    : HIGHLIGHT_COLORS.yellow;

  // 菜单背景样式
  const menuBg = classNames(
    themeColors.glassPanelBg,
    "backdrop-blur-xl backdrop-saturate-150",
    themeColors.borderClass,
  );

  // 按钮样式
  const buttonClass = classNames(themeColors.textClass, themeColors.hoverClass);

  return (
    <div
      className="absolute pointer-events-none z-10 pdf-area-annotation-menu"
      style={{
        left: menuLeft,
        top: menuTop,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute -translate-x-1/2 -translate-y-full mb-2 pointer-events-auto">
        {/* 颜色选择弹出层 */}
        {showColorPicker && (
          <div
            className={classNames(
              "absolute -translate-x-1/2 left-1/2 bottom-full mb-1.5 flex items-center gap-1.5 px-2 py-1.5 border rounded-lg shadow-lg",
              menuBg,
            )}
          >
            {(Object.keys(HIGHLIGHT_COLORS) as EHighlightColor[]).map((key) => (
              <button
                key={key}
                type="button"
                className={classNames(
                  "w-5 h-5 rounded-full border-2 transition-all hover:scale-110",
                  {
                    "border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/30":
                      color === key,
                    "border-transparent": color !== key,
                  },
                )}
                style={{ background: HIGHLIGHT_COLORS[key] }}
                onClick={() => {
                  onColorChange(annotation, key);
                  setShowColorPicker(false);
                }}
              />
            ))}
          </div>
        )}

        {/* 工具栏 */}
        <div
          className={classNames(
            "flex items-center gap-0 px-1 py-1 border rounded-lg shadow-lg",
            menuBg,
          )}
        >
          {/* 颜色选择按钮 */}
          <button
            type="button"
            className={classNames(
              "inline-flex items-center justify-center gap-1 h-7 px-2 bg-transparent rounded transition-colors",
              buttonClass,
            )}
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            <span
              className={classNames(
                "w-3.5 h-3.5 rounded-full border",
                themeColors.borderClass,
              )}
              style={{ background: currentColor }}
            />
          </button>

          <div
            className={classNames("w-px h-4 mx-0.5", themeColors.divideCalass)}
          />

          {/* 添加笔记按钮 */}
          <button
            type="button"
            className={classNames(
              "inline-flex items-center justify-center w-7 h-7 bg-transparent rounded transition-colors",
              buttonClass,
            )}
            title="添加笔记"
            onClick={() => {
              onAddNote(annotation);
              onClose();
            }}
          >
            <StickyNoteIcon size={16} />
          </button>

          <div
            className={classNames("w-px h-4 mx-0.5", themeColors.divideCalass)}
          />

          {/* 删除按钮 */}
          <button
            type="button"
            className="inline-flex items-center justify-center w-7 h-7 bg-transparent text-red-600 dark:text-red-500 rounded transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            title="删除"
            onClick={() => {
              onDelete(annotation);
              onClose();
            }}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AreaAnnotationLayer;
