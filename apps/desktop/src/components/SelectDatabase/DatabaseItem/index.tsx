import styles from "./index.module.less";
import classnames from "classnames";
import { DeleteOutlined } from "@ant-design/icons";

interface DatabaseItemProps {
  name: string;
  onClick?: () => void;
  onClickDelete?: () => void;
  disable?: boolean;
}

const DatabaseItem = (props: DatabaseItemProps) => {
  const { name, onClick, disable, onClickDelete } = props;

  return (
    <div
      className={classnames(styles.item, { [styles.disabled]: disable })}
      onClick={onClick}
    >
      <div className={styles.name}>{name}</div>
      <div
        className={styles.delete}
        onClick={(e) => {
          e.stopPropagation();
          onClickDelete?.();
        }}
      >
        <DeleteOutlined />
      </div>
    </div>
  );
};

export default DatabaseItem;
