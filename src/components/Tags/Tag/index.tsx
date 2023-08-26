import classnames from "classnames";
import { CloseOutlined, TagOutlined } from "@ant-design/icons";
import useSettingStore from "@/hooks/useSettingStore.ts";

import styles from "./index.module.less";

interface ITagProps {
  tag: string;
  showSharp?: boolean;
  showIcon?: boolean;
  closable?: boolean;
  hoverAble?: boolean;
  onClose?: () => void;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const Tag = (props: ITagProps) => {
  const {
    tag,
    showSharp,
    showIcon,
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
        showIcon && <TagOutlined />
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