import React from "react";
import { cn } from "@tau/ui";
import { CaretRight } from "../../../../../../ui/CaretRight";

interface HeaderArrowProps {
  collapsed: boolean;
  onClick: (e: React.MouseEvent) => void;
}

/** 折叠箭头：悬停到标题上时出现，展开时旋转 90° */
const HeaderArrow: React.FC<HeaderArrowProps> = ({ collapsed, onClick }) => (
  <div
    className={cn(
      "absolute -left-[1.5em] top-0 flex h-[1.5em] w-[1.5em] origin-center cursor-pointer select-none items-center justify-center rounded-full opacity-0",
      "transition-[transform,opacity] duration-200 ease-in-out hover:opacity-100",
      collapsed ? "rotate-0 scale-90" : "rotate-90 scale-90"
    )}
    onClick={onClick}
    contentEditable={false}
    data-block-reveal
  >
    <CaretRight />
  </div>
);

export default HeaderArrow;
