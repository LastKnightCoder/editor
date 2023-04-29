import React from "react";
import styles from './index.module.less';

const Highlight: React.FC<{ children: React.ReactNode }> = (props) => {
  const { children } = props;
  return (
    <span className={styles.highlight} >
      {children}
    </span>
  )
}

export default Highlight;