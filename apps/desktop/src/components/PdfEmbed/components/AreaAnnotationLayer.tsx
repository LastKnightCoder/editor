import { useCallback, useState, useEffect } from "react";
import classNames from "classnames";
import { StickyNote as StickyNoteIcon, Trash2 as TrashIcon } from "lucide-react";
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
  const [menuAnnotation, setMenuAnnotation] = useState<PdfAnnotation | null>(null);

  // 当 selectedAnnotationId 变为 null 时，同步关闭菜单
  useEffect(() => {
    if (selectedAnnotationId === null) {
      setMenuAnnotation(null);
    }
  }, [selectedAnnotationId]);

  // 过滤当前页面的区域标注
  const pageAnnotations = annotations.filter(
    anno => anno.type === "area" && anno.areaData?.pageIndex === pageIndex
  );

  const handleClick = useCallback(
    (e: React.MouseEvent, annotation: PdfAnnotation) => {
      e.stopPropagation();
      onSelect(annotation);
      setMenuAnnotation(annotation);
    },
    [onSelect]
  );

  const handleCloseMenu = useCallback(() => {
    setMenuAnnotation(null);
  }, []);

  const handleColorChange = useCallback(
    (annotation: PdfAnnotation, color: EHighlightColor) => {
      onColorChange(annotation, color);
    },
    [onColorChange]
  );

  if (pageAnnotations.length === 0) return null;

  return (
    <div className="z-1 pointer-events-none absolute inset-0">
      {pageAnnotations.map(annotation => {
        const { areaData, color } = annotation;
        if (!areaData) return null;

        const { rect } = areaData;
        const isSelected = selectedAnnotationId === annotation.id;
        const borderColor = color ? HIGHLIGHT_COLORS[color] : "var(--pdf-accent)";
        // 背景色：有颜色时使用对应颜色的浅色透明版本，否则使用默认强调色
        const bgAlpha = isSelected ? 0.25 : 0.12;
        const backgroundColor = color
          ? hexToRgba(HIGHLIGHT_COLORS[color], bgAlpha)
          : accentRgba(bgAlpha);

        return (
          <div
            key={annotation.id}
            className={classNames(
              "pointer-events-auto absolute cursor-pointer rounded border-2 transition-all"
            )}
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.width * scale,
              height: rect.height * scale,
              borderColor,
              backgroundColor,
            }}
            onClick={e => handleClick(e, annotation)}
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

  const currentColor = color ? HIGHLIGHT_COLORS[color] : HIGHLIGHT_COLORS.yellow;

  // 菜单背景样式
  const menuBg = classNames(
    themeColors.glassPanelBg,
    "backdrop-blur-xl backdrop-saturate-150",
    themeColors.borderClass
  );

  // 按钮样式
  const buttonClass = classNames(themeColors.textClass, themeColors.hoverClass);

  return (
    <div
      className="pdf-area-annotation-menu pointer-events-none absolute z-10"
      style={{
        left: menuLeft,
        top: menuTop,
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="pointer-events-auto absolute mb-2 -translate-x-1/2 -translate-y-full">
        {/* 颜色选择弹出层 */}
        {showColorPicker && (
          <div
            className={classNames(
              "absolute bottom-full left-1/2 mb-1.5 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border px-2 py-1.5 shadow-lg",
              menuBg
            )}
          >
            {(Object.keys(HIGHLIGHT_COLORS) as EHighlightColor[]).map(key => (
              <button
                key={key}
                type="button"
                className={classNames(
                  "h-5 w-5 rounded-full border-2 transition-all hover:scale-110",
                  {
                    "ring-[var(--th-accent)]/30 border-[var(--th-border-focus)] ring-2 dark:border-[var(--th-border-focus)]":
                      color === key,
                    "border-transparent": color !== key,
                  }
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
            "flex items-center gap-0 rounded-lg border px-1 py-1 shadow-lg",
            menuBg
          )}
        >
          {/* 颜色选择按钮 */}
          <button
            type="button"
            className={classNames(
              "inline-flex h-7 items-center justify-center gap-1 rounded bg-transparent px-2 transition-colors",
              buttonClass
            )}
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            <span
              className={classNames("h-3.5 w-3.5 rounded-full border", themeColors.borderClass)}
              style={{ background: currentColor }}
            />
          </button>

          <div className={classNames("mx-0.5 h-4 w-px", themeColors.divideClass)} />

          {/* 添加笔记按钮 */}
          <button
            type="button"
            className={classNames(
              "inline-flex h-7 w-7 items-center justify-center rounded bg-transparent transition-colors",
              buttonClass
            )}
            title="添加笔记"
            onClick={() => {
              onAddNote(annotation);
              onClose();
            }}
          >
            <StickyNoteIcon size={16} />
          </button>

          <div className={classNames("mx-0.5 h-4 w-px", themeColors.divideClass)} />

          {/* 删除按钮 */}
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded bg-transparent text-red-600 transition-colors hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-900/20"
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
