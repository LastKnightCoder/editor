import classnames from "classnames";
import styles from './index.module.less';
import React from "react";

interface HoveringButtonProps {
  text: string;
  onClick: (event: React.MouseEvent) => void;
  active: boolean;
}

const HoveringButton = (props: HoveringButtonProps) => {
  const { text, onClick, active } = props;
  return (
    <div className={classnames(styles.buttonContainer, {[styles.active]: active})} onClick={onClick}>
      {text}
    </div>
  )
}

export default HoveringButton;