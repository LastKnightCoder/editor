import Editor from "@/pages/Editor";
import * as dayjs from "dayjs";
import {ICard} from "@/types";
import {Descendant} from "slate";
import styles from './index.module.less';
import {Tag} from "antd";

interface CardItemProps {
  card: ICard;
}

const CardItem = (props: CardItemProps) => {
  const { card } = props;
  const { content, update_time, tags } = card;
  const initValue: Descendant[] = JSON.parse(content);
  return (
    <div className={styles.item}>
      <div className={styles.time}>{dayjs(update_time).format('YYYY-MM-DD HH:mm:ss')}</div>
      <div className={styles.tags}>{tags.split(',').map((tag) => <Tag key={tag} content={tag} />)}</div>
      <div className={styles.content}>
        <Editor initValue={initValue} readonly={true} />
      </div>
    </div>
  )
}

export default CardItem;
