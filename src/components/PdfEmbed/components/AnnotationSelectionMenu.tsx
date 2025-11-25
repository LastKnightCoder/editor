import type { MouseEvent, CSSProperties } from "react";
import { useState } from "react";
import classNames from "classnames";
import type { PdfAnnotationSubtype } from "@embedpdf/models";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import type { Rect } from "@embedpdf/models";
import { LuStickyNote, LuTrash2, LuChevronDown } from "react-icons/lu";
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

  if (!selected) return null;
  const annotationObject = annotation.object;
  if (!TEXT_MARKUP_SUBTYPES.has(annotationObject.type)) {
    return null;
  }

  const selectedColor = normalizeColor(
    "color" in annotationObject ? annotationObject.color : undefined,
  );

  const currentColorOption = ANNOTATION_COLOR_OPTIONS.find(
    (opt) => opt.value.toLowerCase() === selectedColor,
  );

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
      className="pdf-annotation-floating-menu-wrapper"
      style={menuWrapperProps.style}
      ref={menuWrapperProps.ref}
    >
      <div
        className="pdf-annotation-floating-menu"
        style={{
          left: rect.size.width / 2,
        }}
      >
        {/* 颜色选择器弹出层 */}
        {showColorPicker && (
          <div
            className="pdf-annotation-color-popover"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {ANNOTATION_COLOR_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={classNames("pdf-annotation-color-dot", {
                  active: selectedColor === option.value.toLowerCase(),
                })}
                style={{ backgroundColor: option.value }}
                onClick={(e) => handleColorClick(option.value, e)}
                title={option.label}
              />
            ))}
          </div>
        )}

        {/* 主工具栏 - 单行横向排列 */}
        <div className="pdf-annotation-toolbar">
          {/* 颜色选择按钮 */}
          <button
            type="button"
            className="pdf-annotation-toolbar-btn pdf-annotation-color-trigger"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggleColorPicker}
            title="选择颜色"
          >
            <span
              className="pdf-annotation-current-color"
              style={{
                backgroundColor: currentColorOption?.value || "#fde58b",
              }}
            />
            <LuChevronDown size={10} />
          </button>

          <div className="pdf-annotation-toolbar-divider" />

          {/* 样式按钮组 */}
          {ANNOTATION_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={classNames("pdf-annotation-toolbar-btn", {
                active: annotationObject.type === option.value,
              })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleStyleClick(option.value, e)}
              title={option.label}
            >
              {option.icon}
            </button>
          ))}

          <div className="pdf-annotation-toolbar-divider" />

          {/* 添加笔记按钮 */}
          <button
            type="button"
            className="pdf-annotation-toolbar-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleNoteClick}
            title="添加笔记"
          >
            <LuStickyNote size={16} />
          </button>

          {/* 删除按钮 */}
          {onDelete && (
            <>
              <div className="pdf-annotation-toolbar-divider" />
              <button
                type="button"
                className="pdf-annotation-toolbar-btn pdf-annotation-toolbar-btn-danger"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
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
