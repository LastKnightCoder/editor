import { useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import SVG from 'react-inlinesvg';
import cardIcon from '@/assets/icons/card.svg';
import SelectCardModal from '@/components/SelectCardModal';
import useCardsManagementStore from '@/stores/useCardsManagementStore';
import { v4 as getUuid } from 'uuid';

import { useBoard } from '../../../hooks';
import { BoardElement, ECreateBoardElementType } from '../../../types';
import { BoardUtil, CardUtil } from '../../../utils';
import { CardElement } from '../../../plugins';
import { ICard } from '@/types';

interface CardProps {
  className?: string;
  style?: React.CSSProperties;
}

const Card = (props: CardProps) => {
  const { className, style } = props;
  const board = useBoard();

  const { cards } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [excludeCardIds, setExcludeCardIds] = useState([-1]);
  const [selectedCards, setSelectedCards] = useState<ICard[]>([]);

  const handleSelectCard = useMemoizedFn(() => {
    const existCards: BoardElement[] = []
    BoardUtil.dfs(board, element => {
      if (element.type === 'card') {
        existCards.push(element)
      }
    })
    setExcludeCardIds(existCards.map(item => item.cardId));
    setSelectModalOpen(true);
    board.currentCreateType = ECreateBoardElementType.Card;
  })

  const onSelectOk = useMemoizedFn(async (cards: ICard[]) => {
    const card = cards[0];
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    }
    const cardWidth = 300;
    const cardHeight = 300;
    const element: CardElement = {
      id: getUuid(),
      type: 'card',
      cardId: card.id,
      x: center.x - cardWidth / 2,
      y: center.y - cardHeight / 2,
      width: cardWidth,
      height: cardHeight,
      resized: true,
      maxWidth: 300,
      maxHeight: 300,
      paddingHeight: 20,
      paddingWidth: 20,
      ...CardUtil.getPrevCardStyle(),
    }

    board.apply([{
      type: 'insert_node',
      path: [board.children.length],
      node: element
    }, {
      type: 'set_selection',
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [element]
      }
    }]);
    setSelectModalOpen(false);
    setSelectedCards([]);
    board.currentCreateType = ECreateBoardElementType.None;
  });

  const onCancel = useMemoizedFn(() => {
    setSelectModalOpen(false);
    setSelectedCards([]);
  })

  return (
    <div className={className} style={style} onClick={handleSelectCard}>
      <SVG src={cardIcon} />
      <SelectCardModal
        title={'选择卡片'}
        selectedCards={selectedCards}
        onChange={setSelectedCards}
        open={selectModalOpen}
        allCards={cards}
        multiple={false}
        onCancel={onCancel}
        onOk={onSelectOk}
        excludeCardIds={excludeCardIds}
      />
    </div>
  )
}

export default Card;