import { useMemo, useState } from "react";
import { CreateProjectItem, ICard, ProjectItem } from "@/types";
import useProjectsStore from "@/stores/useProjectsStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { useMemoizedFn } from "ahooks";
import { App } from "antd";

const useAddRefCard = (projectItem?: ProjectItem) => {
  const [selectCardModalOpen, setSelectCardModalOpen] = useState(false);
  const [selectedCards, setSelectedCards] = useState<ICard[]>([]);

  const { message } = App.useApp();

  const {
    activeProjectId,
    createChildProjectItem,
  } = useProjectsStore((state) => ({
    activeProjectId: state.activeProjectId,
    createChildProjectItem: state.createChildProjectItem,
  }))

  const {
    cards
  } = useCardsManagementStore((state) => ({
    cards: state.cards
  }));

  const excludeCardIds = useMemo(() => {
    if (!projectItem) return [];
    return [projectItem.refId];
  }, [projectItem]);

  const onChange = useMemoizedFn((selectedCards: ICard[]) => {
    setSelectedCards(selectedCards);
  });

  const onOk = useMemoizedFn(async (selectedCards: ICard[]) => {
    if (selectedCards.length === 0) {
      message.warning('请选择卡片');
      return;
    }

    const selectCard = selectedCards[0];

    if (!projectItem || !activeProjectId) {
      return;
    }

    const createProjectItem: CreateProjectItem = {
      title: '新文档',
      content: selectCard.content,
      children: [],
      parents: [projectItem.id],
      projects: [activeProjectId],
      refType: 'card',
      refId: selectCard.id,
    }

    await createChildProjectItem(projectItem.id, createProjectItem);

    const event = new CustomEvent('refreshProjectItem', {
      detail: {
        id: projectItem.id
      },
    });
    document.dispatchEvent(event);

    setSelectCardModalOpen(false);
  });

  const onCancel = useMemoizedFn(() => {
    setSelectCardModalOpen(false);
  });

  const openSelectCardModal = useMemoizedFn(() => {
    setSelectCardModalOpen(true);
  });

  return {
    selectCardModalOpen,
    openSelectCardModal,
    excludeCardIds,
    selectedCards,
    cards,
    onOk,
    onCancel,
    onChange,
  }
}

export default useAddRefCard;