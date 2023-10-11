import classnames from "classnames";
import styles from './index.module.less';

import { IConfigItem } from "../types";
import {Tooltip} from "antd";

const HoveringButton = (props: IConfigItem) => {
  const { text, onClick, active, style, tooltip } = props;

  return (
    <Tooltip title={tooltip}>
      <div
        style={style}
        className={classnames(styles.buttonContainer, {[styles.active]: active})}
        onClick={onClick}
      >
        {text}
      </div>
    </Tooltip>
  )
}

export default HoveringButton;