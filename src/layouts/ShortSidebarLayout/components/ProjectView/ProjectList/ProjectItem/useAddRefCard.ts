import { useMemo, useState } from "react";
import { CreateProjectItem, ECardCategory, EProjectItemType, ICard, ICreateCard, ProjectItem } from "@/types";
import useProjectsStore from "@/stores/useProjectsStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { useMemoizedFn } from "ahooks";
import { App } from "antd";
import { produce } from "immer";
import { updateProjectItem } from "@/commands";
import { getContentLength } from "@/utils";

const useAddRefCard = (projectItem?: ProjectItem) => {
  const [selectCardModalOpen, setSelectCardModalOpen] = useState(false);
  const [selectedCards, setSelectedCards] = useState<ICard[]>([]);

  const { message } = App.useApp();

  const {
    activeProjectId,
    createChildProjectItem,
    createRootProjectItem,
  } = useProjectsStore((state) => ({
    activeProjectId: state.activeProjectId,
    createChildProjectItem: state.createChildProjectItem,
    createRootProjectItem: state.createRootProjectItem,
  }))

  const {
    cards,
    createCard
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    createCard: state.createCard
  }));

  const excludeCardIds = useMemo(() => {
    if (!projectItem) return [];
    return [projectItem.refId];
  }, [projectItem]);

  const onChange = useMemoizedFn((selectedCards: ICard[]) => {
    setSelectedCards(selectedCards);
  });

  const buildCardFromProjectItem = useMemoizedFn(async (projectItem: ProjectItem) => {
    const { content } = projectItem;
    const newCard: ICreateCard = {
      content,
      tags: [],
      links: [],
      category: ECardCategory.Permanent,
      count: getContentLength(content)
    }
    const createdCard = await createCard(newCard);
    const newProjectItem = produce(projectItem, draft => {
      draft.refId = createdCard.id;
      draft.refType = 'card';
    });
    await updateProjectItem(newProjectItem);
    const event = new CustomEvent('refreshProjectItem', {
      detail: {
        id: projectItem.id
      },
    })
    document.dispatchEvent(event);
    useCardsManagementStore.getState().init();
  });

  const onOk = useMemoizedFn(async (selectedCards: ICard[]) => {
    if (selectedCards.length === 0) {
      message.warning('请选择卡片');
      return;
    }

    const selectCard = selectedCards[0];

    if (!activeProjectId) {
      return;
    }

    const createProjectItem: CreateProjectItem = {
      title: '新文档',
      content: selectCard.content,
      children: [],
      parents: projectItem ? [projectItem.id] : [],
      projects: [activeProjectId],
      refType: 'card',
      refId: selectCard.id,
      projectItemType: EProjectItemType.Document,
      count: 0,
    }

    let item: ProjectItem | undefined;
    if (projectItem) {
      item = await createChildProjectItem(projectItem.id, createProjectItem);
    } else {
      item = await createRootProjectItem(activeProjectId, createProjectItem);
    }

    if (projectItem) {
      const event = new CustomEvent('refreshProjectItem', {
        detail: {
          id: projectItem.id
        },
      });
      document.dispatchEvent(event);
    }

    setSelectCardModalOpen(false);
    if (item) {
      useProjectsStore.setState({
        activeProjectItemId: item.id,
      })
    }

    useCardsManagementStore.getState().init();
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
    buildCardFromProjectItem,
  }
}

export default useAddRefCard;
