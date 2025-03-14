import { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Popover } from "antd";
import { motion } from "framer-motion";
import { useClickAway, useMemoizedFn } from "ahooks";
import { useDrop } from "react-dnd";
import { DownOutlined } from "@ant-design/icons";

import { getEditorText } from "@/utils";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useCardPanelStore, { EActiveSide } from "@/stores/useCardPanelStore.ts";

import TabItem from "./TabItem";

import { ICard } from "@/types";
import styles from "./index.module.less";
import Editor from "@/components/Editor";
import If from "@/components/If";

interface ICardTabsProps {
  cardIds: number[];
  activeCardId?: number;
  side: EActiveSide;
  onClickTab: (id: number) => void;
  onCloseOtherTabs: (id: number, side: EActiveSide) => void;
  onCloseTab: (id: number) => void;
  onMoveCard: (cardId: number) => void;
}

const Portal = ({ children }: { children: React.ReactNode }) => {
  return createPortal(children, document.body);
};

const CardTabs = (props: ICardTabsProps) => {
  const { cards } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }));
  const { dragCardToTabContainer } = useCardPanelStore((state) => ({
    dragCardToTabContainer: state.dragCardToTabContainer,
  }));
  const {
    cardIds,
    activeCardId,
    side,
    onClickTab,
    onCloseTab,
    onMoveCard,
    onCloseOtherTabs,
  } = props;

  const tabCards = useMemo(() => {
    const tabCards = cardIds
      .map((id) => cards.find((card) => card.id === id))
      .filter((card) => !!card) as ICard[];
    return tabCards.reduce(
      (acc, card) => {
        acc[card.id] = card as ICard;
        return acc;
      },
      {} as Record<number, ICard>,
    );
  }, [cardIds, cards]);
  const tabContainerRef = useRef<HTMLDivElement | null>(null);

  const [{ isOver, canDrop }, drop] = useDrop<
    { cardId: number },
    void,
    {
      isOver: boolean;
      canDrop: boolean;
    }
  >({
    accept: "card-tab",
    drop: (item, monitor) => {
      if (monitor.didDrop()) {
        return;
      }

      const monitorClientOffset = monitor.getClientOffset();
      if (!monitorClientOffset) {
        return;
      }
      const tabContainerRect = tabContainerRef.current?.getBoundingClientRect();
      if (!tabContainerRect) {
        return;
      }

      if (
        monitorClientOffset.x - tabContainerRect.x > 0 &&
        monitorClientOffset.x - tabContainerRect.x < 60
      ) {
        dragCardToTabContainer(item.cardId, EActiveSide.Left, false);
      } else {
        dragCardToTabContainer(item.cardId, side);
      }
    },
    canDrop: () => {
      return cardIds.length > 0;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const [morePopoverOpen, setMorePopoverOpen] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [rightClickCardId, setRightClickCardId] = useState<number>();
  const [contextMenuPosition, setContextMenuPosition] = useState({
    x: 0,
    y: 0,
  });
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
  });

  return (
    <motion.div
      ref={(node) => {
        drop(node);
        tabContainerRef.current = node;
      }}
      className={styles.tabsContainer}
      style={{
        opacity: isOver && canDrop ? 0.5 : 1,
      }}
    >
      <Popover
        open={morePopoverOpen}
        onOpenChange={setMorePopoverOpen}
        trigger={"click"}
        placement={"rightBottom"}
        content={
          <div className={styles.moreList}>
            {cardIds.map((cardId) => (
              <Popover
                key={cardId}
                trigger={"hover"}
                content={
                  <div className={styles.popover}>
                    <Editor
                      initValue={tabCards[cardId]?.content || []}
                      readonly
                    />
                  </div>
                }
                placement={"right"}
                styles={{
                  body: {
                    padding: 0,
                  },
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
            ))}
          </div>
        }
      >
        <div className={styles.more}>
          <div className={styles.icon}>
            <DownOutlined />
          </div>
        </div>
      </Popover>
      {cardIds.map((cardId) => (
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
      ))}
      <If condition={showContextMenu}>
        <Portal>
          <div
            ref={contextMenuRef}
            className={styles.contextMenu}
            style={{
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
            }}
          >
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
            <div
              className={styles.item}
              onClick={() => {
                setShowContextMenu(false);
                if (rightClickCardId) {
                  onCloseOtherTabs(rightClickCardId, side);
                }
              }}
            >
              关闭其它卡片
            </div>
          </div>
        </Portal>
      </If>
    </motion.div>
  );
};

export default CardTabs;
