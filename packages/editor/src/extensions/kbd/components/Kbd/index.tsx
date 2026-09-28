import React from "react";
import { RenderElementProps } from "slate-react";

import type { KbdElement } from "../../../../types";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";

import styles from "./index.module.less";

interface KbdProps {
  attributes: RenderElementProps["attributes"];
  element: KbdElement;
  children: React.ReactNode;
}

const Kbd = (props: KbdProps) => {
  const { attributes, children } = props;

  return (
    <kbd {...attributes} className={styles.kbd}>
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </kbd>
  );
};

export default Kbd;
