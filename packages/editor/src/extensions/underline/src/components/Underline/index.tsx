import React from "react";
import { cn } from "@tau/ui";
import { RenderElementProps } from "slate-react";

import { type UnderlineElement } from "../../types.ts";
import { InlineChromiumBugfix } from "@tau/editor/api";
import { getUnderlineColor } from "../../colors.ts";

interface UnderlineProps {
  attributes: RenderElementProps["attributes"];
  element: UnderlineElement;
  children: React.ReactNode;
}

/** 实 / 虚 / 点线用底边框（线距稳定）；波浪用 text-decoration（border 画不出波浪，且能吃 currentColor） */
const LINE_CLASS: Record<string, string> = {
  solid: "border-b-2 border-solid",
  dashed: "border-b-2 border-dashed",
  dotted: "border-b-2 border-dotted",
  wavy: "underline decoration-wavy decoration-[1.5px] underline-offset-[3px]",
};

const Underline = (props: UnderlineProps) => {
  const { attributes, children, element } = props;
  const { lineType, color } = element;
  const underlineColor = getUnderlineColor(color);
  const isWavy = lineType === "wavy";

  return (
    <span
      {...attributes}
      className={cn("relative cursor-pointer", LINE_CLASS[lineType] ?? LINE_CLASS.solid)}
      style={
        isWavy ? { textDecorationColor: underlineColor } : { borderBottomColor: underlineColor }
      }
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </span>
  );
};

export default Underline;
