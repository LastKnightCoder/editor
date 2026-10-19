import { RenderElementProps, useReadOnly } from "slate-react";
import type { HighlightBlockElement } from "../../types";
import { useIsLastElement } from "@tau/editor/api";

import { useEditorTheme as useTheme } from "@tau/editor/api";

import HighlightBlockPure from "../HighlightBlockPure";
import { AddParagraph } from "@tau/editor/api";

import { colors } from "../../configs";

interface IHighBlockProps {
  attributes: RenderElementProps["attributes"];
  element: HighlightBlockElement;
  children: RenderElementProps["children"];
}

const HighlightBlock = (props: IHighBlockProps) => {
  const { attributes, element, children } = props;
  const { color } = element;
  const isLast = useIsLastElement(element);
  const { isDark } = useTheme();
  const readOnly = useReadOnly();

  const themeColor = colors[color] ?? colors.red;
  const { backgroundColor, borderColor } = isDark ? themeColor.dark : themeColor.light;

  return (
    <div className="relative">
      <div {...attributes} className="relative">
        <HighlightBlockPure backgroundColor={backgroundColor} borderColor={borderColor}>
          {children}
        </HighlightBlockPure>
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default HighlightBlock;
