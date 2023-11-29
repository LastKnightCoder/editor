import { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Popover } from "antd";
import { motion } from "framer-motion";
import { useClickAway, useMemoizedFn } from 'ahooks';

import { DownOutlined } from '@ant-design/icons';
import { getEditorText } from "@/utils";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";

import TabItem from './TabItem';

import { ICard } from "@/types";
import styles from './index.module.less';
import Editor from "@/components/Editor";
import If from "@/components/If";

interface ICardTabsProps {
  cardIds: number[];
  activeCardId?: number;
  onClickTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onMoveCard: (cardId: number) => void;
}

const Portal = ({ children }: { children: React.ReactNode }) => {
  return createPortal(children, document.body);
}

const CardTabs = (props: ICardTabsProps) => {
  const {
    cards,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }));
  const { cardIds, activeCardId, onClickTab, onCloseTab, onMoveCard } = props;

  const tabCards = useMemo(() => {
    const tabCards =  cardIds.map(id => cards.find(card => card.id === id)).filter(card => !!card) as ICard[];
    return tabCards.reduce((acc, card) => {
      acc[card.id] = card as ICard;
      return acc;
    }, {} as Record<number, ICard>)
  }, [cardIds, cards]);

  const [morePopoverOpen, setMorePopoverOpen] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [rightClickCardId, setRightClickCardId] = useState<number>();
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useClickAway(() => {
    setShowContextMenu(false);
  }, contextMenuRef);

  const onContextMenu = useMemoizedFn((e: React.MouseEvent, cardId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(true);
    setContextMenuPosition({
      x: e.clientX + 10,
      y: e.clientY + 10,
    });
    setRightClickCardId(cardId);
  })

  return (
    <motion.div className={styles.tabsContainer}>
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
                        initValue={tabCards[cardId]?.content || []}
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
                    {getEditorText(tabCards[cardId]?.content || [])}
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
        cardIds.map((cardId) => (
          <TabItem
            key={cardId}
            cardId={cardId}
            title={getEditorText(tabCards[cardId]?.content || [])}
            active={cardId === activeCardId}
            onClick={() => {
              onClickTab(cardId);
            }}
            onClose={() => {
              onCloseTab(cardId);
            }}
            onContextMenu={(e) => {
              onContextMenu(e, cardId);
            }}
          />
        ))
      }
      <If condition={showContextMenu}>
        <Portal>
          <div ref={contextMenuRef} className={styles.contextMenu} style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}>
            <div
              className={styles.item}
              onClick={() => {
                setShowContextMenu(false);
                if (rightClickCardId) {
                  onMoveCard(rightClickCardId);
                }
              }}
            >
              移动到另一侧
            </div>
          </div>
        </Portal>
      </If>
    </motion.div>
  )
}

export default CardTabs;