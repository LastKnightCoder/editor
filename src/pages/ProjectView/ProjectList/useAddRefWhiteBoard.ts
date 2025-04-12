import { useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { message } from "antd";

import useProjectsStore from "@/stores/useProjectsStore";
import {
  CreateProjectItem,
  EProjectItemType,
  ProjectItem,
  WhiteBoard,
} from "@/types";
import { getProjectItemById, getWhiteBoardById } from "@/commands";
import { defaultProjectItemEventBus } from "@/utils";

const useAddRefWhiteBoard = (
  whiteBoards: WhiteBoard[],
  projectId: number,
  projectItem?: ProjectItem,
) => {
  const [selectWhiteBoardModalOpen, setSelectWhiteBoardModalOpen] =
    useState(false);
  const [selectedWhiteBoards, setSelectedWhiteBoards] = useState<WhiteBoard[]>(
    [],
  );

  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  const { createChildProjectItem, createRootProjectItem } = useProjectsStore(
    (state) => ({
      createChildProjectItem: state.createChildProjectItem,
      createRootProjectItem: state.createRootProjectItem,
    }),
  );

  // 获取已经排除的白板ID（已经关联的白板）
  const excludeWhiteBoardIds =
    projectItem?.refType === "white-board" && projectItem?.refId
      ? [projectItem.refId]
      : [];

  // 打开选择白板弹窗
  const openSelectWhiteBoardModal = useMemoizedFn(async () => {
    setSelectedWhiteBoards([]);
    setSelectWhiteBoardModalOpen(true);
  });

  // 处理白板选择变化
  const onChange = useMemoizedFn((whiteBoards: WhiteBoard[]) => {
    setSelectedWhiteBoards(whiteBoards);
  });

  // 处理确认选择
  const onOk = useMemoizedFn(async (whiteBoards: WhiteBoard[]) => {
    if (whiteBoards.length === 0) {
      message.error("请选择白板");
      return;
    }

    if (!projectId) {
      return;
    }

    try {
      // 目前只处理第一个白板（单选）
      const whiteBoard = whiteBoards[0];

      // 获取完整的白板数据
      const fullWhiteBoard = await getWhiteBoardById(whiteBoard.id);
      if (!fullWhiteBoard || fullWhiteBoard.whiteBoardContentIds.length === 0) {
        message.error(`获取白板 ${whiteBoard.title} 数据失败`);
        return;
      }

      const whiteBoardContentId = fullWhiteBoard.whiteBoardContentIds[0];

      // 创建项目文档，关联白板
      const createProjectItem: CreateProjectItem = {
        title: fullWhiteBoard.title,
        content: [],
        whiteBoardContentId, // 使用原白板的数据
        children: [],
        parents: projectItem ? [projectItem.id] : [],
        projects: [projectId],
        refType: "white-board",
        refId: fullWhiteBoard.id,
        projectItemType: EProjectItemType.WhiteBoard,
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
      }

      message.success("关联白板成功");
      setSelectWhiteBoardModalOpen(false);

      if (item) {
        useProjectsStore.setState({
          activeProjectItemId: item.id,
        });
      }
    } catch (e) {
      console.error(e);
      message.error("关联白板失败");
    }
  });

  // 处理取消选择
  const onCancel = useMemoizedFn(() => {
    setSelectWhiteBoardModalOpen(false);
  });

  return {
    selectWhiteBoardModalOpen,
    openSelectWhiteBoardModal,
    selectedWhiteBoards,
    onChange,
    onOk,
    onCancel,
    whiteBoards,
    excludeWhiteBoardIds,
    multiple: false, // 目前都是单选
  };
};

export default useAddRefWhiteBoard;
