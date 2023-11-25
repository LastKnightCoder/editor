import { CloseOutlined } from '@ant-design/icons';
import classnames from "classnames";
import styles from './index.module.less';

interface ITabItemProps {
  title: string;
  active?: boolean;
  onClick?: () => void;
  onClose?: () => void;
}

const TabItem = (props: ITabItemProps) => {
  const { title, active = false, onClick, onClose } = props;

  return (
    <div className={classnames(styles.item, { [styles.active]: active })} onClick={onClick}>
      <div className={styles.textContainer}>
        <div className={styles.text}>{title}</div>
        <div className={styles.closeIcon} onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onClose?.();
        }}>
          <CloseOutlined />
        </div>
      </div>
    </div>
  )
}

export default TabItem;