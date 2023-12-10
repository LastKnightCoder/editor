import { ICard } from "@/types";
import CardItem2 from "@/pages/Cards/CardItem2";

import styles from './index.module.less';
import classnames from "classnames";
import { useState } from "react";
import { RightOutlined } from "@ant-design/icons";

interface ITagItemProps {
  tag: string;
  cards: ICard[];
  onClickCard: (id: number) => void;
  editingCardId?: number;
}

const TagItem = (props: ITagItemProps) => {
  const { tag, cards, editingCardId, onClickCard } = props;
  const [fold, setFold] = useState(true);

  return (
    <div className={styles.container}>
      <div className={classnames(styles.header, {
        [styles.select]: cards.some(card => card.id === editingCardId),
      })} onClick={() => setFold(!fold)}>
        <div
          className={classnames(styles.icon, styles.foldIcon, {
            [styles.fold]: fold,
          })}
        >
          <RightOutlined />
        </div>
        <div className={styles.tag}>{tag}</div>
        <div className={styles.count}>{cards.length}</div>
      </div>
      <div className={classnames(styles.gridContainer, {
        [styles.fold]: fold,
      })}>
        <div className={styles.children}>
          {
            cards.map((card, index) => (
              <CardItem2
                key={card.id}
                card={card}
                onClick={() => onClickCard(card.id)}
                active={editingCardId === card.id}
                showLine={index !== cards.length - 1}
              />
            ))
          }
        </div>
      </div>
    </div>
  )
}

export default TagItem;