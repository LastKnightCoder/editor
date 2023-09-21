import classnames from "classnames";
import styles from './index.module.less';

import { IConfigItem } from "../types";

const HoveringButton = (props: IConfigItem) => {
  const { text, onClick, active } = props;
  return (
    <div className={classnames(styles.buttonContainer, {[styles.active]: active})} onClick={onClick}>
      {text}
    </div>
  )
}

export default HoveringButton;