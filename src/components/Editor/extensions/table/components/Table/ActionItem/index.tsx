import React from "react";

import styles from "./index.module.less";

interface IActionItemProps {
  icon: React.ReactNode;
  text: string;
}

const ActionItem = (props: IActionItemProps) => {
  const { icon, text } = props;
  return (
    <div className={styles.item}>
      {icon}
      <span>{text}</span>
    </div>
  );
};

export default ActionItem;
