import { memo } from "react";
import { CloseOutlined } from "@ant-design/icons";
import classnames from "classnames";

import { ICard } from "@/types";
import If from "@/components/If";
import Tags from "@/components/Tags";
import Editor from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";

import { formatDate } from "@/utils/time.ts";

import styles from "./index.module.less";

interface CardItemProps {
  card: ICard;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  onDelete?: (e: React.MouseEvent) => void;
  showDelete?: boolean;
}

const CardItem = memo((props: CardItemProps) => {
  const { card, onClick, onDelete, active = false, showDelete = true } = props;
  const { content, update_time, tags } = card;

  return (
    <div
      className={classnames(styles.item, { [styles.active]: active })}
      onClick={onClick}
    >
      <Tags className={styles.tags} tags={tags} showIcon />
      <div className={styles.time}>更新于 {formatDate(update_time, true)}</div>
      <div className={styles.content}>
        <ErrorBoundary>
          <Editor
            initValue={
              content && content.length > 0 ? content.slice(0, 1) : undefined
            }
            readonly={true}
          />
        </ErrorBoundary>
      </div>
      <If condition={showDelete}>
        <div onClick={onDelete} className={styles.delete}>
          <CloseOutlined />
        </div>
      </If>
    </div>
  );
});

export default CardItem;
