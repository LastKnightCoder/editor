import React, { useMemo, useState, useEffect, useContext } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "../../../../ui/Tooltip";
import { Editor, NodeEntry, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { unwrapUnderline, wrapUnderline } from "../../../../utils";
import classnames from "classnames";
import { Underline } from "lucide-react";
import UnderlineSelect from "../UnderlineSelect";
import { HoveringBarContext } from "../../../../components/HoveringToolbar";
import FloatingSubmenu from "../../../../components/HoveringToolbar/FloatingSubmenu";
import type { UnderlineElement } from "../../../types";

type UnderlineColor = "default" | "yellow" | "green" | "blue" | "purple" | "red";
type UnderlineLineType = "solid" | "dashed" | "dotted" | "wavy";

const UNDERLINE_COLOR_KEY = "underline-color";
const UNDERLINE_LINE_TYPE_KEY = "underline-line-type";

const readStoredColor = (): UnderlineColor => {
  if (typeof window === "undefined") {
    return "red";
  }
  return (localStorage.getItem(UNDERLINE_COLOR_KEY) as UnderlineColor | null) || "red";
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
  const editor = useSlate();
  const selection = useSlateSelection();
  const { isHoveringBarShow, isCompact, submenuTrigger } = useContext(HoveringBarContext);
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
          onColorSelect={handleColorSelect}
          onLineTypeSelect={handleLineTypeSelect}
        />
      }
    >
      <Tooltip content={"下划线"}>
        <div
          className={classnames(
            "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
            "ed-toolbar-item",
            isActive && "is-active"
          )}
          onClick={handleClick}
        >
          <Underline size={16} strokeWidth={2.5} />
        </div>
      </Tooltip>
    </FloatingSubmenu>
  );
};

export default HoveringItem;
