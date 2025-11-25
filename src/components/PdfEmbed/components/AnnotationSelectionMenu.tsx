import type { MouseEvent, CSSProperties } from "react";
import classNames from "classnames";
import type { PdfAnnotationSubtype } from "@embedpdf/models";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import type { Rect } from "@embedpdf/models";
import { LuStickyNote, LuTrash2 } from "react-icons/lu";
import {
  ANNOTATION_COLOR_OPTIONS,
  ANNOTATION_STYLE_OPTIONS,
  TEXT_MARKUP_SUBTYPES,
} from "../constants";
import { extractAnnotationText } from "../utils/annotation";

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
  if (!selected) return null;
  const annotationObject = annotation.object;
  if (!TEXT_MARKUP_SUBTYPES.has(annotationObject.type)) {
    return null;
  }
  const selectedColor = normalizeColor(
    "color" in annotationObject ? annotationObject.color : undefined,
  );
  const handleColorClick = (value: string, e: MouseEvent) => {
    e.stopPropagation();
    onColorChange(value);
  };
  const handleStyleClick = (value: PdfAnnotationSubtype, e: MouseEvent) => {
    e.stopPropagation();
    onStyleChange(value);
  };
  const handleNoteClick = (e: MouseEvent) => {
    e.stopPropagation();
    const snippet = extractAnnotationText(annotationObject);
    onAddNote(snippet);
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
        <div className="pdf-annotation-floating-menu-colors">
          {ANNOTATION_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={classNames("pdf-annotation-menu-color", {
                active: selectedColor === option.value.toLowerCase(),
              })}
              style={{ backgroundColor: option.value }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleColorClick(option.value, e)}
            />
          ))}
        </div>
        <div className="pdf-annotation-floating-menu-base">
          {ANNOTATION_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={classNames("pdf-annotation-menu-style", {
                active: annotationObject.type === option.value,
              })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleStyleClick(option.value, e)}
            >
              <span className="pdf-annotation-menu-style-icon">
                {option.icon}
              </span>
              <span className="pdf-annotation-menu-style-text">
                {option.label}
              </span>
            </button>
          ))}
          <button
            type="button"
            className="pdf-annotation-menu-note"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleNoteClick}
          >
            <span className="pdf-annotation-menu-style-icon">
              <LuStickyNote size={16} />
            </span>
            <span className="pdf-annotation-menu-style-text">添加笔记</span>
          </button>
          {onDelete ? (
            <button
              type="button"
              className="pdf-annotation-menu-style danger"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <span className="pdf-annotation-menu-style-icon">
                <LuTrash2 size={16} />
              </span>
              <span className="pdf-annotation-menu-style-text">删除</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AnnotationSelectionMenu;
