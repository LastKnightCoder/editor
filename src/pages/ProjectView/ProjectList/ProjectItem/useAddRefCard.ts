import { useEffect, useMemo, useState } from "react";
import {
  CreateProjectItem,
  ECardCategory,
  EProjectItemType,
  ICard,
  ICreateCard,
  ProjectItem,
} from "@/types";
import useProjectsStore from "@/stores/useProjectsStore";
import { useCreation, useMemoizedFn } from "ahooks";
import { App } from "antd";
import { produce } from "immer";
import {
  getAllCards,
  getProjectItemById,
  updateProjectItem,
  createCard,
  getCardById,
} from "@/commands";
import {
  getContentLength,
  defaultProjectItemEventBus,
  defaultCardEventBus,
} from "@/utils";

const useAddRefCard = (projectId: number, projectItem?: ProjectItem) => {
  const [selectCardModalOpen, setSelectCardModalOpen] = useState(false);
  const [selectedCards, setSelectedCards] = useState<ICard[]>([]);

  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  const { message } = App.useApp();

  const { createChildProjectItem, createRootProjectItem } = useProjectsStore(
    (state) => ({
      createChildProjectItem: state.createChildProjectItem,
      createRootProjectItem: state.createRootProjectItem,
    }),
  );

  const [cards, setCards] = useState<ICard[]>([]);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  const excludeCardIds = useMemo(() => {
    if (!projectItem) return [];
    return [projectItem.refId];
  }, [projectItem]);

  const onChange = useMemoizedFn((selectedCards: ICard[]) => {
    setSelectedCards(selectedCards);
  });

  const buildCardFromProjectItem = useMemoizedFn(
    async (projectItem: ProjectItem) => {
      const { content } = projectItem;
      const newCard: ICreateCard = {
        content,
        tags: [],
        links: [],
        category: ECardCategory.Permanent,
        count: getContentLength(content),
      };
      const createdCard = await createCard(newCard);
      const newProjectItem = produce(projectItem, (draft) => {
        draft.refId = createdCard.id;
        draft.refType = "card";
      });
      const updatedProjectItem = await updateProjectItem(newProjectItem);
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
      defaultCardEventBus
        .createEditor()
        .publishCardEvent("card:created", createdCard);
    },
  );

  const onOk = useMemoizedFn(async (selectedCards: ICard[]) => {
    if (selectedCards.length === 0) {
      message.warning("请选择卡片");
      return;
    }

    const selectCard = selectedCards[0];

    if (!projectId) {
      return;
    }

    const createProjectItem: CreateProjectItem = {
      title: "新文档",
      content: selectCard.content,
      children: [],
      parents: projectItem ? [projectItem.id] : [],
      projects: [projectId],
      refType: "card",
      refId: selectCard.id,
      projectItemType: EProjectItemType.Document,
      count: 0,
    };

    let item: ProjectItem | undefined;
    if (projectItem) {
      item = await createChildProjectItem(
        projectId,
        projectItem.id,
        createProjectItem,
      );
    } else {
      item = await createRootProjectItem(projectId, createProjectItem);
    }

    if (projectItem) {
      const updatedProjectItem = await getProjectItemById(projectItem.id);
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
      if (updatedProjectItem.refType === "card") {
        const card = await getCardById(updatedProjectItem.refId);
        if (card) {
          defaultCardEventBus
            .createEditor()
            .publishCardEvent("card:updated", card);
        }
      }
    }

    setSelectCardModalOpen(false);
    if (item) {
      useProjectsStore.setState({
        activeProjectItemId: item.id,
      });
    }
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
  };
};

export default useAddRefCard;
