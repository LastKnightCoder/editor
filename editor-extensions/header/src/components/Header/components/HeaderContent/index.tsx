import React from "react";
import { cn } from "@tau/ui";
import { RenderElementProps } from "slate-react";
import HeaderArrow from "../HeaderArrow";

interface HeaderContentProps {
  level: number;
  collapsed: boolean;
  toggleCollapse?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  attributes: RenderElementProps["attributes"];
}

/** 各级标题字号（正文 em）；拖拽手柄在 wrapper 上，也靠它换到标题的 em 尺度 */
export const LEVEL_FONT_SIZE: Record<number, string> = {
  1: "text-[2em]",
  2: "text-[1.75em]",
  3: "text-[1.5em]",
  4: "text-[1.25em]",
  5: "text-[1.125em]",
  6: "text-[1em]",
};

/** 各级标题的圆角；h1 行高收紧 */
const LEVEL_CLASS: Record<number, string> = {
  1: "leading-[1.3]",
  2: "rounded-[14px]",
  3: "rounded-[10px]",
  4: "rounded-[0.3em]",
};

/**
 * 标题的上边距（原写在 hN 上的 0.75em，按各级字号换算成正文 em）：挪到块根，
 * chrome 手柄的 top-0 才能与标题顶线对齐（手柄由 wrapper 定位，不认识内层 margin）。
 */
export const LEVEL_MARGIN_TOP: Record<number, string> = {
  1: "mt-[1.5em]",
  2: "mt-[1.3125em]",
  3: "mt-[1.125em]",
  4: "mt-[0.9375em]",
  5: "mt-[0.84375em]",
  6: "mt-[0.75em]",
};

const TAGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;

const HeaderContent: React.FC<HeaderContentProps> = ({
  level,
  collapsed,
  toggleCollapse,
  children,
  attributes,
}) => {
  const normalized = level >= 1 && level <= 6 ? (level as keyof typeof TAGS) : 1;
  const Tag = TAGS[normalized];

  return (
    <div className="relative flex items-center" {...attributes}>
      <Tag
        className={cn(
          "relative flex w-fit flex-wrap items-center gap-[0.25em] pl-[0.1px] font-bold leading-[1.5]",
          collapsed ? "mb-0" : "mb-[1em]",
          LEVEL_FONT_SIZE[normalized],
          LEVEL_CLASS[normalized]
        )}
      >
        {children}
        {toggleCollapse ? <HeaderArrow collapsed={collapsed} onClick={toggleCollapse} /> : null}
      </Tag>
    </div>
  );
};

export default HeaderContent;
