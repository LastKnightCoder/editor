import React from "react";
import { cn } from "@tau/ui";
import { HighlightColor } from "../../types";

// 高亮是用户选定的固定色（与 HighlightSelect 色板同源），不随主题变化
const HIGHLIGHT_COLOR_CLASS: Record<HighlightColor, string> = {
  yellow: "bg-[rgba(255,212,0,0.14)] border-b-[rgb(255,212,0)]",
  red: "bg-[rgba(239,35,60,0.14)] border-b-[rgb(239,35,60)]",
  blue: "bg-[rgba(162,210,255,0.14)] border-b-[rgb(162,210,255)]",
  green: "bg-[rgba(42,157,143,0.14)] border-b-[rgb(42,157,143)]",
  purple: "bg-[rgba(94,84,142,0.14)] border-b-[rgb(94,84,142)]",
};

interface IHighlightProps {
  type?: HighlightColor;
}

const Highlight: React.FC<React.PropsWithChildren<IHighlightProps>> = props => {
  const { type = "yellow" } = props;
  // 未知色值（历史数据）不画高亮，与原样式一致
  const colorClass = HIGHLIGHT_COLOR_CLASS[type];
  return (
    <span className={cn(colorClass && "border-b-2 border-solid", colorClass)} {...props}>
      {props.children}
    </span>
  );
};

export default Highlight;
