import React from "react";
import { cn } from "@tau/ui";
import { RenderElementProps } from "slate-react";

import type { UnderlineElement } from "../../../../types";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";
import { getUnderlineColor } from "../../colors";

interface UnderlineProps {
  attributes: RenderElementProps["attributes"];
  element: UnderlineElement;
  children: React.ReactNode;
}

/** 线条颜色经内联的 borderBottomColor / 波浪 SVG 给出，都取用户选色 */
const LINE_CLASS: Record<string, string> = {
  solid: "border-b-2 border-solid",
  dashed: "border-b-2 border-dashed",
  dotted: "border-b-2 border-dotted",
  wavy: "bg-[length:8px_4px] bg-bottom bg-repeat-x pb-[2px]",
};

/** 波浪线用内嵌 SVG 平铺（border 画不出波浪）；stroke 需写死颜色，data URL 里读不到 CSS 变量 */
export const wavyBackground = (color: string) => {
  const stroke = encodeURIComponent(color);
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 2 Q 2 0, 4 2 T 8 2' stroke='${stroke}' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`;
};

const Underline = (props: UnderlineProps) => {
  const { attributes, children, element } = props;
  const { lineType, color } = element;
  const underlineColor = getUnderlineColor(color);
  const isWavy = lineType === "wavy";

  return (
    <span
      {...attributes}
      className={cn("relative cursor-pointer", LINE_CLASS[lineType])}
      style={
        isWavy
          ? { backgroundImage: wavyBackground(underlineColor) }
          : { borderBottomColor: underlineColor }
      }
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </span>
  );
};

export default Underline;
