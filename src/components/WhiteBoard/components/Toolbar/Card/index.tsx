import { useEffect, useState, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import SVG from "react-inlinesvg";
import cardIcon from "@/assets/icons/card.svg";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { getAllCards } from "@/commands";
import { v4 as getUuid } from "uuid";

import { useBoard } from "../../../hooks";
import { BoardElement, ECreateBoardElementType } from "../../../types";
import { BoardUtil, CardUtil } from "../../../utils";
import { CardElement } from "../../../plugins";
import { ICard } from "@/types";
import { IndexType, SearchResult } from "@/types/search";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { message } from "antd";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

interface CardProps {
  className?: string;
  style?: React.CSSProperties;
}

const Card = (props: CardProps) => {
  const { className, style } = props;
  const board = useBoard();

  const [cards, setCards] = useState<ICard[]>([]);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [excludeCardIds, setExcludeCardIds] = useState<number[]>([]);

  const handleSelectCard = useMemoizedFn(() => {
    const existCards: BoardElement[] = [];
    BoardUtil.dfs(board, (element) => {
      if (element.type === "card") {
        existCards.push(element);
      }
    });
    setExcludeCardIds(existCards.map((item) => item.cardId));
    setSelectModalOpen(true);
    board.currentCreateType = ECreateBoardElementType.Card;
  });

  const initialContents = useMemo(() => {
    return cards.map((card) => ({
      id: card.id,
      contentId: card.contentId,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const onSelectOk = useMemoizedFn(
    async (selectedResult: SearchResult | SearchResult[]) => {
      const results = Array.isArray(selectedResult)
        ? selectedResult
        : [selectedResult];
      if (results.length === 0) {
        message.error("没有可选择的卡片");
        return;
      }

      const result = results[0];
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      };
      const cardWidth = 300;
      const cardHeight = 300;
      const element: CardElement = {
        id: getUuid(),
        type: "card",
        cardId: result.id,
        x: center.x - cardWidth / 2,
        y: center.y - cardHeight / 2,
        width: cardWidth,
        height: cardHeight,
        resized: true,
        maxWidth: 300,
        maxHeight: 300,
        paddingHeight: 20,
        paddingWidth: 20,
        readonly: false,
        ...CardUtil.getPrevCardStyle(),
      };

      board.apply([
        {
          type: "insert_node",
          path: [board.children.length],
          node: element,
        },
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [element],
          },
        },
      ]);
      setSelectModalOpen(false);
      board.currentCreateType = ECreateBoardElementType.None;
    },
  );

  const onCancel = useMemoizedFn(() => {
    setSelectModalOpen(false);
  });

  return (
    <div className={className} style={style} onClick={handleSelectCard}>
      <SVG src={cardIcon} />
      <div onClick={(e) => e.stopPropagation()}>
        <ContentSelectorModal
          title={"选择卡片"}
          open={selectModalOpen}
          onCancel={onCancel}
          onSelect={onSelectOk}
          contentType="card"
          extensions={customExtensions}
          emptyDescription="没有可选择的卡片"
          showTitle={false}
          multiple={false}
          excludeIds={excludeCardIds}
          initialContents={initialContents}
        />
      </div>
    </div>
  );
};

export default Card;
