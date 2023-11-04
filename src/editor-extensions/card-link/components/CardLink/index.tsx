import React, { useMemo } from "react";
import { Popover } from "antd";
import { RenderElementProps } from "slate-react";

import { CardLinkElement } from "@/editor-extensions/card-link";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import CardContent from "../CardContent";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";

import styles from './index.module.less';

interface ICardLinkProps {
  attributes: RenderElementProps['attributes'];
  element: CardLinkElement;
  children: React.ReactNode;
}

const CardLink = (props: ICardLinkProps) => {
  const { attributes, children, element } = props;
  const { cardId } = element;

  const {
    cards,
  } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  const linkCard = useMemo(() => {
    return cards.find((card) => card.id === cardId);
  }, [cards, cardId]);

  return (
    <Popover
      trigger={'click'}
      content={<CardContent card={linkCard} />}
      overlayInnerStyle={{
        maxWidth: 400,
        maxHeight: 300,
        overflow: 'auto',
      }}
      style={{
        top: 20,
      }}
      arrow={false}
    >
      <span className={styles.cardLinkContainer} {...attributes}>
        <InlineChromiumBugfix />
          {children}
        <InlineChromiumBugfix />
      </span>
    </Popover>
  )
}

export default CardLink;