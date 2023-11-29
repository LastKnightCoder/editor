import { useEffect, useState } from "react";
import { EditOutlined, ReadOutlined } from '@ant-design/icons';
import CardTabs from './CardTabs';
import EditCard from "../EditCard";
import If from "@/components/If";

import styles from './index.module.less';
import { Tooltip } from "antd";
import isHotkey from "is-hotkey";

interface ICardsManagementProps {
  cardIds: number[];
  activeCardId?: number;
  onClickCard: (id: number) => void;
  onClickTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onMoveCard: (cardId: number) => void;
}

const CardsManagement = (props: ICardsManagementProps) => {
  const {
    cardIds,
    activeCardId,
    onClickCard: onClickLinkCard,
    onCloseTab,
    onClickTab,
    onMoveCard,
  } = props;

  const [readonly, setReadonly] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+/', e)) {
        setReadonly(!readonly);
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [readonly]);

  return (
    <div className={styles.manageContainer}>
      <div className={styles.cardsManagement}>
        <CardTabs
          cardIds={cardIds}
          activeCardId={activeCardId}
          onClickTab={onClickTab}
          onCloseTab={onCloseTab}
          onMoveCard={onMoveCard}
        />
        <If condition={!!activeCardId}>
          <div className={styles.editCardContainer}>
            <EditCard
              key={activeCardId!}
              cardId={activeCardId!}
              onClickLinkCard={onClickLinkCard}
              readonly={readonly}
            />
          </div>
        </If>
      </div>
      <If condition={!!activeCardId}>
        <div className={styles.statusBar}>
          <div>
            {
              readonly ? (
                <Tooltip title={'编辑'}>
                  <EditOutlined onClick={() => setReadonly(false)} />
                </Tooltip>
              ) : (
                <Tooltip title={'预览'}>
                  <ReadOutlined onClick={() => setReadonly(true)} />
                </Tooltip>
              )
            }
          </div>
        </div>
      </If>
    </div>
  )
}

export default CardsManagement;