import React from "react";
import { RenderElementProps, useSlateStatic } from "slate-react";
import { cn } from "@tau/ui";
import type { HeaderElement } from "../../../types";
import { useHeaderCollapse } from "./hooks";
import { HeaderContent, LEVEL_MARGIN_TOP } from "./components";

interface IHeaderProps {
  attributes: RenderElementProps["attributes"];
  element: HeaderElement;
  disableCollapse?: boolean;
}

const Header: React.FC<React.PropsWithChildren<IHeaderProps>> = props => {
  const { element, attributes, children, disableCollapse = false } = props;
  const { level, collapsed = false } = element;
  const editor = useSlateStatic();

  const { toggleCollapse } = useHeaderCollapse({
    editor,
    element,
  });

  // 如果禁用了 Header 折叠功能，则不显示折叠状态
  const effectiveCollapsed = disableCollapse ? false : collapsed;
  const normalizedLevel = level >= 1 && level <= 6 ? level : 1;

  return (
    <div
      className={cn(
        "relative",
        LEVEL_MARGIN_TOP[normalizedLevel],
        effectiveCollapsed && "mb-[0.5em]"
      )}
    >
      <HeaderContent
        level={level}
        collapsed={effectiveCollapsed}
        toggleCollapse={disableCollapse ? undefined : toggleCollapse}
        attributes={attributes}
      >
        {children}
      </HeaderContent>
    </div>
  );
};

export default Header;
