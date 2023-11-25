import { useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import { App } from "antd";

const useCardManagement = () => {
  const [leftCardIds, setLeftCardIds] = useState<number[]>([]); // 左侧卡片的id
  const [rightCardIds, setRightCardIds] = useState<number[]>([]); // 右侧卡片的id
  const [leftActiveCardId, setLeftActiveCardId] = useState<number>(); // 当前激活的卡片id
  const [rightActiveCardId, setRightActiveCardId] = useState<number>(); // 当前激活的卡片id
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left'); // 当前活动窗口

  const { modal } = App.useApp();

  const {
    createCard,
    deleteCard,
  } = useCardsManagementStore((state) => ({
    deleteCard: state.deleteCard,
    createCard: state.createCard,
  }));

  const onClickTab = useMemoizedFn((cardId: number) => {
    if (leftCardIds.includes(cardId)) {
      if (cardId === leftActiveCardId) {
        setLeftActiveCardId(undefined);
      } else {
        setLeftActiveCardId(cardId);
      }
      setActiveSide('left');
    } else if (rightCardIds.includes(cardId)) {
      if (cardId === rightActiveCardId) {
        setRightActiveCardId(undefined);
      } else {
        setRightActiveCardId(cardId);
      }
      setActiveSide('right');
    }
  });

  const onCloseTab = useMemoizedFn((cardId: number) => {
    removeCard(cardId);
  });

  const onClickCard = useMemoizedFn((cardId: number) => {
    if (leftCardIds.includes(cardId) || rightCardIds.includes(cardId)) {
      onClickTab(cardId);
      return;
    }

    addCard(cardId);
  });

  const onCreateCard = useMemoizedFn(async () => {
    const id = await createCard({
      content: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: ''
        }]
      }],
      tags: [],
      links: [],
    });
    addCard(id);
  });

  const onDeleteCard = useMemoizedFn(async (cardId: number) => {
    modal.confirm({
      title: '确认删除？',
      content: '删除后无法恢复',
      onOk: async () => {
        await deleteCard(cardId);
        if (cardIds.includes(cardId)) {
          removeCard(cardId);
        }
      },
      okText: '确认',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    });
  });

  const onMoveCard = useMemoizedFn((cardId: number) => {
    if (!leftCardIds.includes(cardId) && !rightCardIds.includes(cardId)) {
      return;
    }
    if (leftCardIds.includes(cardId)) {
      // 从左边移出，加入右边
      setLeftCardIds(leftCardIds.filter((id) => id !== cardId));
      setRightCardIds([...rightCardIds, cardId]);
      setRightActiveCardId(cardId);
      if (cardId === leftActiveCardId) {
        setLeftActiveCardId(undefined);
      }
    } else {
      // 从右边移出，加入左边
      setRightCardIds(rightCardIds.filter((id) => id !== cardId));
      setLeftCardIds([...leftCardIds, cardId]);
      setLeftActiveCardId(cardId);
      if (cardId === rightActiveCardId) {
        setRightActiveCardId(undefined);
      }
    }
  });

  const addCard = useMemoizedFn((cardId: number) => {
    if (leftCardIds.includes(cardId) || rightCardIds.includes(cardId)) {
      return;
    }
    if (activeSide === 'left') {
      setLeftCardIds([...leftCardIds, cardId]);
      setLeftActiveCardId(cardId);
    } else {
      setRightCardIds([...rightCardIds, cardId]);
      setRightActiveCardId(cardId);
    }
  });

  const removeCard = useMemoizedFn((cardId: number) => {
    if (leftCardIds.includes(cardId)) {
      setLeftCardIds(leftCardIds.filter((id) => id !== cardId));
      if (leftActiveCardId === cardId) {
        const nextActiveCardId = leftCardIds.find((id) => id !== cardId);
        setLeftActiveCardId(nextActiveCardId);
      }
    } else if (rightCardIds.includes(cardId)) {
      setRightCardIds(rightCardIds.filter((id) => id !== cardId));
      if (rightActiveCardId === cardId) {
        const nextActiveCardId = rightCardIds.find((id) => id !== cardId);
        setRightActiveCardId(nextActiveCardId);
      }
    }
  });

  const onActiveSideChange = useMemoizedFn((cardId: number) => {
    if (!leftCardIds.includes(cardId) && !rightCardIds.includes(cardId)) {
      return;
    }
    if (leftCardIds.includes(cardId)) {
      setActiveSide('left');
    } else {
      setActiveSide('right');
    }
  })

  return {
    leftCardIds,
    leftActiveCardId,
    rightCardIds,
    rightActiveCardId,
    onClickTab,
    onCloseTab,
    onClickCard,
    onCreateCard,
    onDeleteCard,
    onMoveCard,
    onActiveSideChange,
    activeSide,
  }
}

export default useCardManagement;