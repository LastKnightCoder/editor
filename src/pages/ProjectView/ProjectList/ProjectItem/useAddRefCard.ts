import { useMemo, useState } from "react";
import {
  CreateProjectItem,
  EProjectItemType,
  ICard,
  ProjectItem,
} from "@/types";
import { useCreation, useMemoizedFn } from "ahooks";
import { App } from "antd";
import { produce } from "immer";
import {
  updateProjectItem,
  createCardFromProjectItem,
  addRootProjectItem,
  addChildProjectItem,
} from "@/commands";
import { defaultProjectItemEventBus, defaultCardEventBus } from "@/utils";

const useAddRefCard = (
  cards: ICard[],
  projectId: number,
  projectItem?: ProjectItem,
) => {
  const [selectCardModalOpen, setSelectCardModalOpen] = useState(false);

  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  const { message } = App.useApp();

  const excludeCardIds = useMemo(() => {
    if (!projectItem) return [];
    return [projectItem.refId];
  }, [projectItem]);

  const buildCardFromProjectItem = useMemoizedFn(
    async (projectItem: ProjectItem) => {
      const createdCard = await createCardFromProjectItem(projectItem.id);
      const newProjectItem = produce(projectItem, (draft) => {
        draft.refId = createdCard.id;
        draft.refType = "card";
      });
      const updatedProjectItem = await updateProjectItem(newProjectItem);
      if (!updatedProjectItem) return;
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
      refType: "card",
      refId: selectCard.id,
      projectItemType: EProjectItemType.Document,
      count: 0,
      whiteBoardContentId: 0,
    };

    setSelectCardModalOpen(false);

    if (projectItem) {
      const res = await addChildProjectItem(projectItem.id, createProjectItem);
      return res;
    } else {
      const res = await addRootProjectItem(projectId, createProjectItem);
      return res;
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
    cards,
    onOk,
    onCancel,
    buildCardFromProjectItem,
  };
};

export default useAddRefCard;
