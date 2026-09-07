import React, { memo } from "react";
import styles from "../index.module.less";

interface CodeTextProps {
  children: React.ReactNode;
}

const CodeText = memo(({ children }: CodeTextProps) => {
  return <code className={styles.code}>{children}</code>;
});

CodeText.displayName = "CodeText";

export default CodeText;
