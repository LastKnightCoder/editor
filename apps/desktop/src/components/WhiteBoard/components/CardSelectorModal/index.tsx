import { useEffect, useState, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import { v4 as getUuid } from "uuid";

import ContentSelectorModal from "@/components/ContentSelectorModal";
import { getAllCards } from "@/commands";
import { ICard } from "@/types";
import { IndexType, SearchResult } from "@/types/search";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

import Board from "../../Board";
import { BoardElement, ECreateBoardElementType } from "../../types";
import { BoardUtil, CardUtil } from "../../utils";
import { CardElement } from "../../plugins";

interface CardSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
}

const CardSelectorModal = ({ open, onClose, board }: CardSelectorModalProps) => {
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const [cards, setCards] = useState<ICard[]>([]);
  const [excludeCardIds, setExcludeCardIds] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      getAllCards().then(cards => {
        setCards(cards);
      });

      // 获取已存在的卡片 ID
      const existCards: BoardElement[] = [];
      BoardUtil.dfs(board, element => {
        if (element.type === "card") {
          existCards.push(element);
        }
      });
      setExcludeCardIds(existCards.map(item => (item as any).cardId));
    }
  }, [open, board]);

  const initialContents = useMemo(() => {
    return cards.map(card => ({
      id: card.id,
      contentId: card.contentId,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const onSelectOk = useMemoizedFn(async (selectedResult: SearchResult | SearchResult[]) => {
    const results = Array.isArray(selectedResult) ? selectedResult : [selectedResult];
    if (results.length === 0) {
      toast.error("没有可选择的卡片");
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
      readonly: false,
      ...CardUtil.load(),
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
    board.currentCreateType = ECreateBoardElementType.None;
    onClose();
  });

  const handleCancel = useMemoizedFn(() => {
    onClose();
  });

  return (
    <div onClick={e => e.stopPropagation()}>
      <ContentSelectorModal
        title="选择卡片"
        open={open}
        onCancel={handleCancel}
        onSelect={onSelectOk}
        contentType="card"
        extensions={dynamicExtensions}
        emptyDescription="没有可选择的卡片"
        showTitle={false}
        multiple={false}
        excludeIds={excludeCardIds}
        initialContents={initialContents}
      />
    </div>
  );
};

export default CardSelectorModal;
