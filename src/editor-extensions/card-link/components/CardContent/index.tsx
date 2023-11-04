import Editor from '@/components/Editor';
import { ICard } from "@/types";
import styles from './index.module.less';

interface ICardContentProps {
  card?: ICard;
}

const CardContent = (props: ICardContentProps) => {
  const { card } = props;

  if (!card) {
    return (
      <div className={styles.notFound}>
        该卡片不存在
      </div>
    )
  }

  return (
    <div className={styles.cardContentContainer}>
      <Editor
        initValue={card.content}
        readonly
      />
    </div>
  )
}

export default CardContent;