import React, {PropsWithChildren} from "react";
import { RenderElementProps } from "slate-react";
import { MathJax } from "better-react-mathjax";
import { BlockMathElement } from "../../custom-types";
import AddParagraph from "../AddParagraph";

interface BlockMathProps {
  attributes: RenderElementProps['attributes'];
  element: BlockMathElement;
}

const InlineMath: React.FC<PropsWithChildren<BlockMathProps>> = (props) => {
  const { attributes, element, children } = props;
  const { tex } = element;
  return (
    <div {...attributes}>
      <MathJax>$${tex}$$</MathJax>
      {children}
      <AddParagraph element={element} />
    </div>
  )
}

export default InlineMath;
