import React from "react";
import { inlineHighlight } from "../../constants/inline-palette";
import { HighlightColor } from "../../types";

interface IHighlightProps {
  type?: HighlightColor;
}

/** 高亮取统一行内色板：同色相淡底 + 底线，随明暗切换；未知色值（历史数据）不画高亮 */
const Highlight: React.FC<React.PropsWithChildren<IHighlightProps>> = props => {
  const { type = "yellow", children } = props;
  const colors = inlineHighlight(type);
  return (
    <span
      className={colors ? "border-b-2 border-solid" : undefined}
      style={
        colors ? { backgroundColor: colors.background, borderBottomColor: colors.line } : undefined
      }
    >
      {children}
    </span>
  );
};

export default Highlight;
