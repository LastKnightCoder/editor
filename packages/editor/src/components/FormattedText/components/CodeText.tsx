import React, { memo } from "react";
import classnames from "classnames";
import styles from "../index.module.less";

interface CodeTextProps {
  children: React.ReactNode;
  isDark: boolean;
}

const CodeText = memo(({ children, isDark }: CodeTextProps) => {
  return (
    <code className={classnames(styles.code, { [styles.dark]: isDark })}>
      {children}
    </code>
  );
});

CodeText.displayName = "CodeText";

export default CodeText;
