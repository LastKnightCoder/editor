import React, {PropsWithChildren} from "react";
import { RenderElementProps } from "slate-react";
import { MathJax } from "better-react-mathjax";
import { InlineMathElement } from "../../custom-types";
import InlineChromiumBugfix from "../InlineChromiumBugFix";
import styles from './index.module.less';

interface InlineMathProps {
  attributes: RenderElementProps['attributes'];
  element: InlineMathElement;
}

const InlineMath: React.FC<PropsWithChildren<InlineMathProps>> = (props) => {
  const { attributes, element, children } = props;
  const { tex } = element;
  return (
    <span {...attributes} className={styles.inlineMath}>
      <MathJax inline>${tex}$</MathJax>
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </span>
  )
}

export default InlineMath;
