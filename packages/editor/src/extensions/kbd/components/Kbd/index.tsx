import React from "react";
import classnames from "classnames";
import { RenderElementProps } from "slate-react";

import type { KbdElement } from "../../../../types";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";
import useTheme from "../../../../hooks/useTheme";

import styles from "./index.module.less";

interface KbdProps {
  attributes: RenderElementProps["attributes"];
  element: KbdElement;
  children: React.ReactNode;
}

const Kbd = (props: KbdProps) => {
  const { attributes, children } = props;
  const { isDark } = useTheme();

  return (
    <kbd
      {...attributes}
      className={classnames(styles.kbd, { [styles.dark]: isDark })}
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </kbd>
  );
};

export default Kbd;
