import React, { useContext, useMemo } from "react";
import { Popover } from "antd";
import { RenderElementProps } from "slate-react";

import { CardLinkElement } from "@/editor-extensions/card-link";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import CardContent from "../CardContent";
import { EditCardContext } from "@/context";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useCardPanelStore, { EActiveSide } from "@/stores/useCardPanelStore";

import styles from './index.module.less';

interface ICardLinkProps {
  attributes: RenderElementProps['attributes'];
  element: CardLinkElement;
  children: React.ReactNode;
}

const CardLink = (props: ICardLinkProps) => {
  const { attributes, children, element } = props;
  const { cardId } = element;

  const { cardId: editingCardId } = useContext(EditCardContext) || {};

  const {
    cards,
  } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  const {
    addCardToSide,
    leftCardIds,
    rightCardIds,
  } = useCardPanelStore(state => ({
    addCardToSide: state.addCardToSide,
    leftCardIds: state.leftCardIds,
    rightCardIds: state.rightCardIds,
  }));

  const linkCard = useMemo(() => {
    return cards.find((card) => card.id === cardId);
  }, [cards, cardId]);

  const side = useMemo(() => {
    if (!editingCardId) return EActiveSide.Left;
    if (leftCardIds.includes(editingCardId)) {
      return EActiveSide.Right;
    } else if (rightCardIds.includes(editingCardId)) {
      return EActiveSide.Left;
    }

    return EActiveSide.Left;
  }, [leftCardIds, rightCardIds, editingCardId]);

  return (
    <Popover
      trigger={'hover'}
      content={<CardContent card={linkCard} />}
      overlayInnerStyle={{
        padding: 0,
      }}
      style={{
        top: 20,
      }}
      arrow={false}
      placement={'bottom'}
      mouseEnterDelay={0.5}
    >
      <span
        onClick={() => { addCardToSide(cardId, side) }}
        className={styles.cardLinkContainer}
        {...attributes}
      >
        <InlineChromiumBugfix />
          {children}
        <InlineChromiumBugfix />
      </span>
    </Popover>
  )
}

export default CardLink;