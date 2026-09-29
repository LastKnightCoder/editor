import React from "react";
import { cn } from "@tau/ui";
import { RenderElementProps } from "slate-react";
import { BLOCK_DRAG_GROUP } from "../../../../../../components/BlockDrag";
import HeaderArrow from "../HeaderArrow";
import DragHandle from "../DragHandle";

interface HeaderContentProps {
  level: number;
  collapsed: boolean;
  toggleCollapse?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  attributes: RenderElementProps["attributes"];
  dragRef: React.Ref<HTMLDivElement>;
  canDrag: boolean;
}

/** 各级标题的字号与圆角；h1 行高收紧 */
const LEVEL_CLASS: Record<number, string> = {
  1: "text-[2em] leading-[1.3]",
  2: "text-[1.75em] rounded-[14px]",
  3: "text-[1.5em] rounded-[10px]",
  4: "text-[1.25em] rounded-[0.3em]",
  5: "text-[1.125em]",
  6: "text-[1em]",
};

const TAGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;

const HeaderContent: React.FC<HeaderContentProps> = ({
  level,
  collapsed,
  toggleCollapse,
  children,
  attributes,
  dragRef,
  canDrag,
}) => {
  const normalized = level >= 1 && level <= 6 ? (level as keyof typeof TAGS) : 1;
  const Tag = TAGS[normalized];

  return (
    <div className="relative flex items-center" {...attributes}>
      {/* 手柄与折叠箭头都挂在标题本身的悬停上（不是整行），所以 group 放在 hN 上 */}
      <Tag
        className={cn(
          BLOCK_DRAG_GROUP,
          "relative mt-[0.75em] flex w-fit flex-wrap items-center gap-[0.25em] pl-[0.1px] font-bold leading-[1.5]",
          collapsed ? "mb-0" : "mb-[1em]",
          LEVEL_CLASS[normalized]
        )}
      >
        <DragHandle dragRef={dragRef} canDrag={canDrag} />
        {children}
        {toggleCollapse ? <HeaderArrow collapsed={collapsed} onClick={toggleCollapse} /> : null}
      </Tag>
    </div>
  );
};

export default HeaderContent;
