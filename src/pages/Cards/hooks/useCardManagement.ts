import { useMemoizedFn } from 'ahooks';
import { App } from "antd";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useCardPanelStore, { EActiveSide } from "@/stores/useCardPanelStore.ts";

const useCardManagement = () => {
  const {
    createCard,
    deleteCard,
  } = useCardsManagementStore((state) => ({
    deleteCard: state.deleteCard,
    createCard: state.createCard,
  }));

  const {
    leftCardIds,
    rightCardIds,
    leftActiveCardId,
    rightActiveCardId,
    activeSide,
    addCard,
    removeCard,
    moveCard,
    closeOtherTabs,
  } = useCardPanelStore((state) => ({
    leftCardIds: state.leftCardIds,
    rightCardIds: state.rightCardIds,
    leftActiveCardId: state.leftActiveCardId,
    rightActiveCardId: state.rightActiveCardId,
    addCard: state.addCard,
    removeCard: state.removeCard,
    moveCard: state.moveCard,
    activeSide: state.activeSide,
    closeOtherTabs: state.closeOtherTabs,
  }));

  const { modal } = App.useApp();

  const onClickTab = useMemoizedFn((id: number) => {
    if (!leftCardIds.includes(id) && !rightCardIds.includes(id)) {
      return;
    }
    if (leftCardIds.includes(id)) {
      useCardPanelStore.setState({
        leftActiveCardId: id === leftActiveCardId ? undefined : id,
      });
    } else {
      useCardPanelStore.setState({
        rightActiveCardId: id === rightActiveCardId ? undefined : id,
      });
    }
  });

  const onCloseTab = useMemoizedFn( (id: number) => {
    removeCard(id);
  });

  const onClickCard = useMemoizedFn( (id: number) => {
    if (leftCardIds.includes(id) || rightCardIds.includes(id)) {
      onClickTab(id);
    } else {
      addCard(id);
    }
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
        removeCard(cardId);
      },
      okText: '确认',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    });
  });

  const onMoveCard = useMemoizedFn ((cardId: number) => {
    moveCard(cardId);
  });

  const onCloseOtherTabs = useMemoizedFn((id: number, side: EActiveSide) => {
    closeOtherTabs(id, side);
  });

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
    activeSide,
    onCloseOtherTabs,
  }
}

export default useCardManagement;