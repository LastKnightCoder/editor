import { DeleteOutlined } from "@ant-design/icons";
import { WhiteBoardContent } from "@/types";
import { App } from "antd";
import { memo } from "react";
import styles from "./index.module.less";

interface SubWhiteBoardItemProps {
  item: WhiteBoardContent;
  isActive: boolean;
  onItemClick: (item: WhiteBoardContent) => void;
  onDelete: (id: number) => void;
}

const SubWhiteBoardItem = ({
  item,
  isActive,
  onItemClick,
  onDelete,
}: SubWhiteBoardItemProps) => {
  const { modal } = App.useApp();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    modal.confirm({
      title: "提示",
      content: "确定删除该子白板吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: () => {
        onDelete(item.id);
      },
    });
  };

  return (
    <div
      className={`${styles.subWhiteBoardItem} ${isActive ? styles.active : ""}`}
      onClick={() => onItemClick(item)}
    >
      <span className={styles.name}>{item.name}</span>
      <DeleteOutlined className={styles.deleteButton} onClick={handleDelete} />
    </div>
  );
};

export default memo(SubWhiteBoardItem);
