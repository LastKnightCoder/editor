import React from 'react';
import {ICard} from "@/types";
import Editor from '@/components/Editor';
import styles from './index.module.less';
import useEditCardStore from "../../hooks/useEditCardStore.ts";
import { CloseOutlined } from '@ant-design/icons';
import classnames from "classnames";
import Tags from "@/components/Tags";

interface CardListProps {
  list: ICard[];
  showClose?: boolean;
}

const CardList = (props: CardListProps) => {
  const { list, showClose = false } = props;

  const {
    addLink,
    removeLink
  } = useEditCardStore((state) => ({
    addLink: state.addLink,
    removeLink: state.removeLink,
  }));

  const handleAddLink = (id: number) => {
    if (showClose) {
      return;
    }
    addLink(id);
  }

  const handleRemoveLink = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
    e.stopPropagation();
    removeLink(id);
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
              <div className={itemClass} onClick={() => { handleAddLink(card.id) }}>
                <Tags className={styles.tags} tags={card.tags} />
                <div className={styles.editor}>
                  <Editor readonly={true} initValue={card.content} />
                </div>
                {
                  showClose &&
                  <div className={styles.closeIcon} onClick={(e) => { handleRemoveLink(e, card.id) }}>
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