import React, { memo } from "react";
import Highlight from "../../Highlight";
import { HighlightColor } from "../../../types";

interface HighlightTextProps {
  children: React.ReactNode;
  highlight: boolean | string;
}

const HighlightText = memo(({ children, highlight }: HighlightTextProps) => {
  let type: HighlightColor = "yellow";
  if (typeof highlight === "string") {
    type = highlight as HighlightColor;
  }
  return <Highlight type={type}>{children}</Highlight>;
});

HighlightText.displayName = "HighlightText";

export default HighlightText;
