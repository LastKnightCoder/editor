import classnames from "classnames";
import { CloseOutlined, TagOutlined } from "@ant-design/icons";
import useSettingStore from "@/stores/useSettingStore.ts";

import styles from "./index.module.less";
import {ReactNode} from "react";

interface ITagProps {
  tag: ReactNode;
  showSharp?: boolean;
  showIcon?: boolean;
  icon?: React.ReactNode;
  closable?: boolean;
  hoverAble?: boolean;
  onClose?: () => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}

const Tag = (props: ITagProps) => {
  const {
    tag,
    showSharp,
    showIcon,
    icon,
    closable,
    hoverAble,
    onClose,
    onClick,
    className,
    style,
  } = props;

  const { darkMode } = useSettingStore(state => ({
    darkMode: state.darkMode
  }))

  const tagClassName = classnames(
    styles.tagContainer,
    {
      [styles.dark]: darkMode,
      [styles.hoverAble]: hoverAble
    },
    className
  )

  return (
    <div className={tagClassName} style={style} onClick={onClick}>
      {
        showIcon && icon || <TagOutlined />
      }
      <div className={styles.tag}>{ showSharp ? '#' : '' }{tag}</div>
      {
        closable && (
          <div className={styles.close} onClick={onClose}>
            <CloseOutlined />
          </div>
        )
      }
    </div>
  )
}

export default Tag;