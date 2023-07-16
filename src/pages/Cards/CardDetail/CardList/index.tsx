import React from 'react';
import {ICard} from "@/types";
import Editor from '@/components/Editor';
import styles from './index.module.less';
import { CloseOutlined } from '@ant-design/icons';
import classnames from "classnames";
import Tags from "@/components/Tags";

interface CardListProps {
  list: ICard[];
  showClose?: boolean;
  onClick?: (id: number) => void;
  onClose?: (id: number) => void;
}

const CardList = (props: CardListProps) => {
  const { list, showClose = false, onClick, onClose } = props;

  const handleClickCard = (id: number) => {
    onClick && onClick(id);
  }

  const handleOnClose = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
    e.stopPropagation();
    onClose && onClose(id);
  }

  const itemClass = classnames(styles.item, 'clay', {
    [styles.hover]: !showClose,
  });

  return (
    <div className={styles.list}>
      {
        list.map((card, index) => {
          return (
            <React.Fragment key={card.id}>
              <div className={itemClass} onClick={() => { handleClickCard(card.id) }}>
                <Tags className={styles.tags} tags={card.tags} />
                <div className={styles.editor}>
                  <Editor readonly={true} initValue={card.content} />
                </div>
                {
                  showClose &&
                  <div className={styles.closeIcon} onClick={(e) => { handleOnClose(e, card.id) }}>
                    <CloseOutlined />
                  </div>
                }
              </div>
              {
                index !== list.length - 1 &&
                <div className={styles.divider} />
              }
            </React.Fragment>
          )
        })
      }
    </div>
  )
}

export default CardList;