import type { MouseEvent, CSSProperties } from "react";
import { useState } from "react";
import classNames from "classnames";
import { App } from "antd";
import type { PdfAnnotationSubtype } from "@embedpdf/models";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import type { Rect } from "@embedpdf/models";
import { LuStickyNote, LuTrash2, LuChevronDown } from "react-icons/lu";
import useThemeColors from "@/hooks/useThemeColors";
import {
  ANNOTATION_COLOR_OPTIONS,
  ANNOTATION_STYLE_OPTIONS,
  TEXT_MARKUP_SUBTYPES,
} from "../constants";

interface AnnotationSelectionMenuProps {
  annotation: TrackedAnnotation;
  selected: boolean;
  rect: Rect;
  menuWrapperProps: {
    style?: CSSProperties;
    ref?: (el: HTMLDivElement | null) => void;
  };
  onColorChange: (color: string) => void;
  onStyleChange: (subtype: PdfAnnotationSubtype) => void;
  onAddNote: (snippet?: string) => void;
  onDelete?: () => void;
}

const normalizeColor = (color?: unknown) => {
  if (typeof color === "string") {
    return color.toLowerCase();
  }
  return null;
};

const AnnotationSelectionMenu = ({
  annotation,
  selected,
  rect,
  menuWrapperProps,
  onColorChange,
  onStyleChange,
  onAddNote,
  onDelete,
}: AnnotationSelectionMenuProps) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const { modal } = App.useApp();
  const themeColors = useThemeColors();

  if (!selected) return null;
  const annotationObject = annotation.object;
  if (!TEXT_MARKUP_SUBTYPES.has(annotationObject.type)) {
    return null;
  }

  const selectedColor = normalizeColor(
    "color" in annotationObject ? annotationObject.color : undefined
  );

  const currentColorOption = ANNOTATION_COLOR_OPTIONS.find(
    opt => opt.value.toLowerCase() === selectedColor
  );

  // 菜单背景样式
  const menuBg = classNames(
    themeColors.glassPanelBg,
    "backdrop-blur-xl backdrop-saturate-150",
    themeColors.borderClass
  );

  // 按钮样式
  const buttonClass = classNames(themeColors.textClass, themeColors.hoverClass);

  const handleColorClick = (value: string, e: MouseEvent) => {
    e.stopPropagation();
    onColorChange(value);
    setShowColorPicker(false);
  };

  const handleStyleClick = (value: PdfAnnotationSubtype, e: MouseEvent) => {
    e.stopPropagation();
    onStyleChange(value);
  };

  const handleNoteClick = (e: MouseEvent) => {
    e.stopPropagation();
    // 不再使用选中文本作为笔记内容，笔记初始为空
    onAddNote();
  };

  const toggleColorPicker = (e: MouseEvent) => {
    e.stopPropagation();
    setShowColorPicker(!showColorPicker);
  };

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={menuWrapperProps.style}
      ref={menuWrapperProps.ref}
    >
      <div
        className="pointer-events-auto absolute mb-2 -translate-x-1/2 -translate-y-full"
        style={{
          left: rect.size.width / 2,
        }}
      >
        {/* 颜色选择器弹出层 */}
        {showColorPicker && (
          <div
            className={classNames(
              "absolute bottom-full left-1/2 mb-1.5 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border px-2 py-1.5 shadow-lg",
              menuBg
            )}
            onPointerDown={e => e.stopPropagation()}
          >
            {ANNOTATION_COLOR_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                className={classNames(
                  "h-5 w-5 rounded-full border-2 transition-all hover:scale-110",
                  {
                    "ring-[var(--th-accent)]/30 border-[var(--th-border-focus)] ring-2 dark:border-[var(--th-border-focus)]":
                      selectedColor === option.value.toLowerCase(),
                    "border-transparent": selectedColor !== option.value.toLowerCase(),
                  }
                )}
                style={{ backgroundColor: option.value }}
                onClick={e => handleColorClick(option.value, e)}
                title={option.label}
              />
            ))}
          </div>
        )}

        {/* 主工具栏 - 单行横向排列 */}
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
            onPointerDown={e => e.stopPropagation()}
            onClick={toggleColorPicker}
            title="选择颜色"
          >
            <span
              className={classNames("h-3.5 w-3.5 rounded-full border", themeColors.borderClass)}
              style={{
                backgroundColor: currentColorOption?.value || "#fde58b",
              }}
            />
            <LuChevronDown size={10} />
          </button>

          <div className={classNames("mx-0.5 h-4 w-px", themeColors.divideClass)} />

          {/* 样式按钮组 */}
          {ANNOTATION_STYLE_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={classNames(
                "inline-flex h-7 w-7 items-center justify-center rounded bg-transparent transition-colors",
                buttonClass,
                annotationObject.type === option.value && themeColors.activeClass
              )}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => handleStyleClick(option.value, e)}
              title={option.label}
            >
              {option.icon}
            </button>
          ))}

          <div className={classNames("mx-0.5 h-4 w-px", themeColors.divideClass)} />

          {/* 添加笔记按钮 */}
          <button
            type="button"
            className={classNames(
              "inline-flex h-7 w-7 items-center justify-center rounded bg-transparent transition-colors",
              buttonClass
            )}
            onPointerDown={e => e.stopPropagation()}
            onClick={handleNoteClick}
            title="添加笔记"
          >
            <LuStickyNote size={16} />
          </button>

          {/* 删除按钮 */}
          {onDelete && (
            <>
              <div className={classNames("mx-0.5 h-4 w-px", themeColors.divideClass)} />
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded bg-transparent text-red-600 transition-colors hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-900/20"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  modal.confirm({
                    title: "确认删除",
                    content: "确定要删除此标注吗？此操作无法撤销。",
                    okText: "删除",
                    okType: "danger",
                    cancelText: "取消",
                    onOk: () => {
                      onDelete();
                    },
                  });
                }}
                title="删除"
              >
                <LuTrash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnotationSelectionMenu;
