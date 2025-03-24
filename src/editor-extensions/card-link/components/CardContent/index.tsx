import Editor from "@/components/Editor";
import { ICard } from "@/types";
import styles from "./index.module.less";
import { Empty } from "antd";

interface ICardContentProps {
  card?: ICard;
}

const CardContent = (props: ICardContentProps) => {
  const { card } = props;

  if (!card) {
    return (
      <div className={styles.notFound}>
        <Empty description="该卡片不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className={styles.cardContentContainer}>
      <Editor initValue={card.content} readonly />
    </div>
  );
};

export default CardContent;
