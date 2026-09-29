import React, { PropsWithChildren } from "react";
import { RenderElementProps, useReadOnly } from "slate-react";
import classnames from "classnames";
import type { BlockquoteElement } from "../../../types";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import AddParagraph from "../../../../components/AddParagraph";

interface IBlockQuoteProps {
  attributes: RenderElementProps["attributes"];
  element: BlockquoteElement;
}

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = props => {
  const { attributes, element, children } = props;

  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);

  return (
    <div className="relative">
      <div {...attributes} className="relative">
        <div
          className={classnames(
            "relative py-[0.75em] pl-[1.5em] italic leading-relaxed transition-colors duration-200",
            "text-[var(--ed-text-secondary)]"
          )}
        >
          <div
            contentEditable={false}
            className="absolute bottom-1 left-0 top-1 w-1 select-none rounded-full"
            style={{ backgroundColor: "var(--ed-accent)" }}
          />
          {children}
        </div>
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Blockquote;
