import React from "react";
import classnames from "classnames";
import { RenderElementProps } from "slate-react";

import type { UnderlineElement } from "../../../../types";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";

import styles from "./index.module.less";

interface UnderlineProps {
  attributes: RenderElementProps["attributes"];
  element: UnderlineElement;
  children: React.ReactNode;
}

const Underline = (props: UnderlineProps) => {
  const { attributes, children, element } = props;
  const { lineType, color } = element;

  return (
    <span
      {...attributes}
      className={classnames(styles.underline, styles[color], styles[lineType])}
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </span>
  );
};

export default Underline;
