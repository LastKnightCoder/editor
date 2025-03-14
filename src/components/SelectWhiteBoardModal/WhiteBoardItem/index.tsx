import { memo } from "react";
import { CloseOutlined } from "@ant-design/icons";
import classnames from "classnames";

import { WhiteBoard } from "@/types";
import If from "@/components/If";
import Tags from "@/components/Tags";
import LocalImage from "@/components/LocalImage";

import { formatDate } from "@/utils/time.ts";

import styles from "./index.module.less";

interface WhiteBoardItemProps {
  whiteBoard: WhiteBoard;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  onDelete?: (e: React.MouseEvent) => void;
  showDelete?: boolean;
}

const defaultSnapshot =
  "https://d2hulr7xnfjroe.cloudfront.net/Frame_1321315996_35405ab097.png";

const WhiteBoardItem = memo((props: WhiteBoardItemProps) => {
  const {
    whiteBoard,
    onClick,
    onDelete,
    active = false,
    showDelete = true,
  } = props;
  const { updateTime, tags, title, description, snapshot } = whiteBoard;

  return (
    <div
      className={classnames(styles.item, { [styles.active]: active })}
      onClick={onClick}
    >
      <div className={styles.imageContainer}>
        <LocalImage url={snapshot || defaultSnapshot} />
      </div>
      <div className={styles.content}>
        <div className={styles.title}>{title}</div>
        <If condition={tags && tags.length > 0}>
          <Tags className={styles.tags} tags={tags} showIcon />
        </If>
        <div className={styles.time}>更新于 {formatDate(updateTime, true)}</div>
        <If condition={!!description}>
          <div className={styles.description}>{description}</div>
        </If>
      </div>
      <If condition={showDelete}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onDelete && onDelete(e);
          }}
          className={styles.delete}
        >
          <CloseOutlined />
        </div>
      </If>
    </div>
  );
});

export default WhiteBoardItem;
