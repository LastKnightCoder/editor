import React, { useEffect, useState, memo } from "react";
import { Popover } from "antd";
import { RenderElementProps } from "slate-react";

import { CardLinkElement } from "@/editor-extensions/card-link";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import CardContent from "../CardContent";
import useRightSidebarStore from "@/stores/useRightSidebarStore";

import styles from "./index.module.less";
import { getEditorText } from "@/utils";
import { getCardById } from "@/commands";
import { ICard } from "@/types";

interface ICardLinkProps {
  attributes: RenderElementProps["attributes"];
  element: CardLinkElement;
  children: React.ReactNode;
}

const CardLink = memo((props: ICardLinkProps) => {
  const { attributes, children, element } = props;
  const { cardId } = element;

  const [card, setCard] = useState<ICard | undefined>(undefined);

  useEffect(() => {
    getCardById(cardId).then((card) => {
      setCard(card);
    });
  }, [cardId]);

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { addTab } = useRightSidebarStore.getState();

    if (addTab && card) {
      addTab({
        id: String(card.id),
        type: "card",
        title: getEditorText(card.content, 10),
      });
    }
  };

  return (
    <Popover
      trigger={"hover"}
      content={<CardContent card={card} />}
      styles={{
        body: {
          padding: 0,
        },
      }}
      style={{
        top: 20,
      }}
      arrow={false}
      placement={"bottom"}
      mouseEnterDelay={0.5}
    >
      <span
        onClick={handleCardClick}
        className={styles.cardLinkContainer}
        {...attributes}
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </span>
    </Popover>
  );
});

export default CardLink;
