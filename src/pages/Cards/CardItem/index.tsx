import { memo } from "react";
import dayjs from "dayjs";
import classnames from "classnames";

import { ICard } from "@/types";
import If from "@/components/If";
import Tags from "@/components/Tags";
import Editor from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";

import styles from './index.module.less';
import { CloseOutlined } from "@ant-design/icons";

interface CardItemProps {
  card: ICard;
  onClick?: (e: any) => void;
  active?: boolean;
  onDelete?: (e: any) => void;
  showDelete?: boolean;
}

const CardItem = memo((props: CardItemProps) => {
  const { card, onClick, onDelete, active = false, showDelete=true } = props;
  const { content, update_time, tags } = card;

  return (
    <div className={classnames(styles.item, { [styles.active]: active })} onClick={onClick}>
      <Tags
        className={styles.tags}
        tags={tags}
        showIcon
      />
      <div className={styles.time}>
        更新于 {dayjs(update_time).format('YYYY/MM/DD HH:mm:ss')}
      </div>
      <div className={styles.content}>
        <ErrorBoundary>
          <Editor initValue={(content && content.length > 0) ? content.slice(0, 1) : undefined} readonly={true} />
        </ErrorBoundary>
      </div>
      <If condition={showDelete}>
        <div onClick={onDelete} className={styles.delete}>
          <CloseOutlined />
        </div>
      </If>
    </div>
  )
});

export default CardItem;
