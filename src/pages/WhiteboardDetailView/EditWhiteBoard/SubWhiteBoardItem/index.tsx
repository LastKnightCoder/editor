import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { WhiteBoardContent } from "@/types";
import { App } from "antd";
import { memo } from "react";
import styles from "./index.module.less";

interface SubWhiteBoardItemProps {
  item: WhiteBoardContent;
  isActive: boolean;
  onItemClick: (item: WhiteBoardContent) => void;
  onDelete: (id: number) => void;
  onEdit: (item: WhiteBoardContent) => void;
}

const SubWhiteBoardItem = memo(
  ({
    item,
    isActive,
    onItemClick,
    onDelete,
    onEdit,
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

    const handleEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(item);
    };

    return (
      <div
        className={`${styles.subWhiteBoardItem} ${isActive ? styles.active : ""}`}
        onClick={() => onItemClick(item)}
      >
        <span className={styles.name}>{item.name}</span>
        <div className={styles.actions}>
          <EditOutlined className={styles.editButton} onClick={handleEdit} />
          <DeleteOutlined
            className={styles.deleteButton}
            onClick={handleDelete}
          />
        </div>
      </div>
    );
  },
);

export default SubWhiteBoardItem;
