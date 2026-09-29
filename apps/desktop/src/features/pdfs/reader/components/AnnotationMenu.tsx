/**
 * 点中已有文本标注时的工具条：挂在引擎 AnnotationLayer 的 selectionMenu 上（引擎按标注矩形给出定位框）。
 * Esc 经页面浮层仲裁取消选中。
 */

import type { CSSProperties } from "react";
import type { Rect } from "@embedpdf/models";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import { useOverlayDismiss } from "@/page/PageProvider";
import { colorFromHex, hasNote, markupStyleOf } from "../annotationModel";
import { overlayProps, useReader } from "../readerContext";
import { FloatToolbar } from "./FloatToolbar";

export interface SelectionMenuProps {
  annotation: TrackedAnnotation;
  selected: boolean;
  rect: Rect;
  menuWrapperProps: {
    style?: CSSProperties;
    ref?: (el: HTMLDivElement | null) => void;
  };
}

export function AnnotationMenu({
  annotation,
  selected,
  rect,
  menuWrapperProps,
  onDeselect,
}: SelectionMenuProps & { onDeselect: () => void }) {
  const reader = useReader();
  useOverlayDismiss(onDeselect, selected);
  const object = annotation.object;
  const style = markupStyleOf(object);
  if (!selected || !style) return null;
  const record = reader.records.find(r => r.annotation.id === object.id);
  const below = rect.origin.y < 52;

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={menuWrapperProps.style}
      ref={menuWrapperProps.ref}
    >
      <div
        {...overlayProps}
        className="pointer-events-auto absolute -translate-x-1/2"
        style={{
          left: rect.size.width / 2,
          ...(below ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }),
        }}
      >
        <FloatToolbar
          mode="annotation"
          color={colorFromHex((object as { color?: unknown }).color) ?? undefined}
          markupStyle={style}
          hasNote={record ? hasNote(record) : false}
          canAsk={reader.canAsk}
          onColor={color => reader.recolor(object, color)}
          onToggleStyle={() => reader.toggleStyle(object)}
          onNote={() => reader.openNote(object)}
          onAsk={() => reader.ask(object)}
          onCopy={() => reader.copy(object)}
          onDelete={() => reader.remove(object)}
        />
      </div>
    </div>
  );
}
