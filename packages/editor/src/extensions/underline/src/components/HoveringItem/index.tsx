import { useEditorI18n } from "../../../../../i18n";
import React, { useMemo, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { EditorTooltip as Tooltip } from "@tau/editor/api";
import { Editor, NodeEntry, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { unwrapUnderline, wrapUnderline } from "../../selection.ts";
import classnames from "classnames";
import { ChevronDown } from "lucide-react";
import UnderlineSelect, { type UnderlineLineType } from "../UnderlineSelect/index.tsx";
import { getInlinePaletteEntry, inlineInk } from "@tau/editor/extensions/text-formatting/palette";
import { useToolbarState } from "@tau/editor/api";
import { ToolbarSubmenu as FloatingSubmenu } from "@tau/editor/api";
import { type UnderlineElement } from "../../types.ts";

/** "default" 跟随文字色，其余取统一行内色板的色相 id */
type UnderlineColor = string;

const UNDERLINE_COLOR_KEY = "underline-color";
const UNDERLINE_LINE_TYPE_KEY = "underline-line-type";

const readStoredColor = (): UnderlineColor => {
  if (typeof window === "undefined") {
    return "red";
  }
  const value = localStorage.getItem(UNDERLINE_COLOR_KEY);
  return value === "default" || getInlinePaletteEntry(value) ? (value as string) : "red";
};

const readStoredLineType = (): UnderlineLineType => {
  if (typeof window === "undefined") {
    return "solid";
  }
  const value = localStorage.getItem(UNDERLINE_LINE_TYPE_KEY) as UnderlineLineType | null;
  return value === "dashed" || value === "dotted" || value === "wavy" ? value : "solid";
};

const persistColor = (color: UnderlineColor) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(UNDERLINE_COLOR_KEY, color);
};

const persistLineType = (lineType: UnderlineLineType) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(UNDERLINE_LINE_TYPE_KEY, lineType);
};

const HoveringItem = () => {
  const { t } = useEditorI18n();
  const editor = useSlate();
  const selection = useSlateSelection();
  const { isHoveringBarShow, isCompact, submenuTrigger } = useToolbarState();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState<UnderlineColor>(() => readStoredColor());
  const [selectedLineType, setSelectedLineType] = useState<UnderlineLineType>(() =>
    readStoredLineType()
  );

  const underlineEntries = useMemo(() => {
    if (!selection) {
      return [] as NodeEntry<UnderlineElement>[];
    }
    return Array.from(
      Editor.nodes(editor, {
        at: selection,
        match: n => !Editor.isEditor(n) && n.type === "underline",
      })
    ) as NodeEntry<UnderlineElement>[];
  }, [editor, selection]);

  const isActive = useMemo(() => underlineEntries.length > 0, [underlineEntries]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapUnderline(editor);
        return;
      }
      wrapUnderline(editor);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  useEffect(() => {
    if (!isHoveringBarShow) {
      setPopoverOpen(false);
    }
  }, [isHoveringBarShow]);

  useEffect(() => {
    if (underlineEntries.length > 0) {
      const [node] = underlineEntries[0];
      const color = (node.color as UnderlineColor) || readStoredColor();
      const lineType = (node.lineType as UnderlineLineType) || readStoredLineType();
      setSelectedColor(prev => (prev === color ? prev : color));
      setSelectedLineType(prev => (prev === lineType ? prev : lineType));
      return;
    }
    const storedColor = readStoredColor();
    const storedLineType = readStoredLineType();
    setSelectedColor(prev => (prev === storedColor ? prev : storedColor));
    setSelectedLineType(prev => (prev === storedLineType ? prev : storedLineType));
  }, [underlineEntries]);

  const updateActiveUnderline = useMemoizedFn(
    (payload: Partial<Pick<UnderlineElement, "color" | "lineType">>) => {
      underlineEntries.forEach(([, path]) => {
        Transforms.setNodes(editor, payload, { at: path });
      });
    }
  );

  const handleColorSelect = useMemoizedFn((color: string) => {
    const nextColor = color as UnderlineColor;
    setSelectedColor(nextColor);
    persistColor(nextColor);
    if (underlineEntries.length > 0) {
      updateActiveUnderline({ color: nextColor });
      if (isCompact) {
        setPopoverOpen(false);
      }
      return;
    }
    wrapUnderline(editor);
    ReactEditor.focus(editor);
    if (isCompact) {
      setPopoverOpen(false);
    }
  });

  const handleLineTypeSelect = useMemoizedFn((lineType: UnderlineLineType) => {
    setSelectedLineType(lineType);
    persistLineType(lineType);
    if (underlineEntries.length > 0) {
      updateActiveUnderline({ lineType });
      if (isCompact) {
        setPopoverOpen(false);
      }
      return;
    }
    wrapUnderline(editor);
    ReactEditor.focus(editor);
    if (isCompact) {
      setPopoverOpen(false);
    }
  });
  const handleRemove = useMemoizedFn(() => {
    unwrapUnderline(editor);
    ReactEditor.focus(editor);
    if (isCompact) {
      setPopoverOpen(false);
    }
  });

  const barColor = inlineInk(selectedColor);

  return (
    <FloatingSubmenu
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      trigger={submenuTrigger}
      isHoveringBarShow={isHoveringBarShow}
      zIndex={10100}
      gap={10}
      content={
        <UnderlineSelect
          selectedColor={selectedColor}
          selectedLineType={selectedLineType}
          canRemove={isActive}
          onColorSelect={handleColorSelect}
          onLineTypeSelect={handleLineTypeSelect}
          onRemove={handleRemove}
        />
      }
    >
      <Tooltip content={t("format.underline")} disabled={popoverOpen}>
        <div
          className={classnames(
            "flex h-8 cursor-pointer items-center justify-center gap-0.5 rounded-lg px-1.5",
            "ed-toolbar-item",
            isActive && "is-active",
            popoverOpen && "is-open"
          )}
          onClick={handleClick}
        >
          {/* 16px 图标盒与工具条其他图标同几何，底线色条同步当前下划线颜色 */}
          <span aria-hidden className="relative size-4 shrink-0">
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 4v6a6 6 0 0 0 12 0V4" />
            </svg>
            <span
              className={classnames(
                "absolute inset-x-[2px] top-[12.5px] h-[2.5px] rounded-full",
                !barColor && "bg-current"
              )}
              style={barColor ? { backgroundColor: barColor } : undefined}
            />
          </span>
          <ChevronDown size={11} strokeWidth={3} className="opacity-60" />
        </div>
      </Tooltip>
    </FloatingSubmenu>
  );
};

export default HoveringItem;
