import React, { useEffect, useMemo, useState } from "react";
import { Popover } from "antd";
import { RenderElementProps } from "slate-react";

import { CardLinkElement } from "@/editor-extensions/card-link";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import CardContent from "../CardContent";
import useRightSidebarStore from "@/stores/useRightSidebarStore";

import styles from "./index.module.less";
import { getEditorText } from "@/utils";
import { getAllCards } from "@/commands";
import { ICard } from "@/types";

interface ICardLinkProps {
  attributes: RenderElementProps["attributes"];
  element: CardLinkElement;
  children: React.ReactNode;
}

const CardLink = (props: ICardLinkProps) => {
  const { attributes, children, element } = props;
  const { cardId } = element;

  const [cards, setCards] = useState<ICard[]>([]);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  const linkCard = useMemo(() => {
    return cards.find((card) => card.id === cardId);
  }, [cards, cardId]);

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { addTab } = useRightSidebarStore.getState();

    if (addTab && linkCard) {
      addTab({
        id: String(linkCard.id),
        type: "card",
        title: getEditorText(linkCard.content, 10),
      });
    }
  };

  return (
    <Popover
      trigger={"hover"}
      content={<CardContent card={linkCard} />}
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
};

export default CardLink;
