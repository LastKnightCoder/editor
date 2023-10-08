import classnames from "classnames";
import styles from './index.module.less';

import { IConfigItem } from "../types";

const HoveringButton = (props: IConfigItem) => {
  const { text, onClick, active, style } = props;

  return (
    <div
      style={style}
      className={classnames(styles.buttonContainer, {[styles.active]: active})}
      onClick={onClick}
    >
      {text}
    </div>
  )
}

export default HoveringButton;