import { useMemo, useState } from "react";
import { Popover } from "antd";

import { DownOutlined } from '@ant-design/icons';
import { getEditorText } from "@/utils";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";

import TabItem from './TabItem';

import { ICard } from "@/types";
import styles from './index.module.less';
import Editor from "@/components/Editor";

interface ICardTabsProps {
  cardIds: number[];
  activeCardId?: number;
  onClickTab: (id: number) => void;
  onCloseTab: (id: number) => void;
}

const CardTabs = (props: ICardTabsProps) => {
  const {
    cards,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }));
  const { cardIds, activeCardId, onClickTab, onCloseTab } = props;

  const tabCards = useMemo(() => {
    const tabCards =  cardIds.map(id => cards.find(card => card.id === id)).filter(card => !!card) as ICard[];
    return tabCards.reduce((acc, card) => {
      acc[card.id] = card as ICard;
      return acc;
    }, {} as Record<number, ICard>)
  }, [cardIds, cards]);

  const [morePopoverOpen, setMorePopoverOpen] = useState(false);
  
  return (
    <div className={styles.tabsContainer}>
      <Popover
        open={morePopoverOpen}
        onOpenChange={setMorePopoverOpen}
        trigger={'click'}
        placement={'rightBottom'}
        content={(
          <div className={styles.moreList}>
            {
              cardIds.map(cardId => (
                <Popover
                  key={cardId}
                  trigger={'hover'}
                  content={(
                    <div className={styles.popover}>
                      <Editor
                        initValue={tabCards[cardId].content}
                        readonly
                      />
                    </div>
                  )}
                  placement={'right'}
                  overlayInnerStyle={{
                    padding: 0
                  }}
                >
                  <div
                    key={cardId}
                    className={styles.item}
                    onClick={() => {
                      onClickTab(cardId);
                      setMorePopoverOpen(false);
                    }}
                  >
                    {getEditorText(tabCards[cardId].content)}
                  </div>
                </Popover>
              ))
            }
          </div>
        )}
      >
        <div className={styles.more}>
          <div className={styles.icon}>
            <DownOutlined />
          </div>
        </div>
      </Popover>
      {
        cardIds.map(cardId => (
          <TabItem
            key={cardId}
            title={getEditorText(tabCards[cardId].content)}
            active={cardId === activeCardId}
            onClick={() => {
              onClickTab(cardId);
            }}
            onClose={() => {
              onCloseTab(cardId);
            }}
          />
        ))
      }
    </div>
  )
}

export default CardTabs;