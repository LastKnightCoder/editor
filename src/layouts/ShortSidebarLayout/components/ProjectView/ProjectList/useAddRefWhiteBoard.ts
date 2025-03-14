import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";

import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import useProjectsStore from "@/stores/useProjectsStore";
import {
  CreateProjectItem,
  EProjectItemType,
  ProjectItem,
  WhiteBoard,
} from "@/types";
import { getWhiteBoardById } from "@/commands";

/**
 * 用于在项目项中添加/关联白板的 hook
 * @param projectItem 当前项目项
 * @returns 白板选择相关的状态和方法
 */
const useAddRefWhiteBoard = (projectItem?: ProjectItem) => {
  const [selectWhiteBoardModalOpen, setSelectWhiteBoardModalOpen] =
    useState(false);
  const [selectedWhiteBoards, setSelectedWhiteBoards] = useState<WhiteBoard[]>(
    [],
  );

  const { whiteBoards, initWhiteBoards } = useWhiteBoardStore((state) => ({
    whiteBoards: state.whiteBoards,
    initWhiteBoards: state.initWhiteBoards,
  }));

  const { activeProjectId, createChildProjectItem, createRootProjectItem } =
    useProjectsStore((state) => ({
      activeProjectId: state.activeProjectId,
      createChildProjectItem: state.createChildProjectItem,
      createRootProjectItem: state.createRootProjectItem,
    }));

  // 获取已经排除的白板ID（已经关联的白板）
  const excludeWhiteBoardIds =
    projectItem?.refType === "white-board" && projectItem?.refId
      ? [projectItem.refId]
      : [];

  // 打开选择白板弹窗
  const openSelectWhiteBoardModal = useMemoizedFn(async () => {
    if (whiteBoards.length === 0) {
      await initWhiteBoards();
    }
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

    if (!activeProjectId) {
      return;
    }

    try {
      // 目前只处理第一个白板（单选）
      const whiteBoard = whiteBoards[0];

      // 获取完整的白板数据
      const fullWhiteBoard = await getWhiteBoardById(whiteBoard.id);
      if (!fullWhiteBoard) {
        message.error(`获取白板 ${whiteBoard.title} 数据失败`);
        return;
      }

      // 创建项目文档，关联白板
      const createProjectItem: CreateProjectItem = {
        title: fullWhiteBoard.title,
        content: [],
        whiteBoardData: fullWhiteBoard.data, // 使用原白板的数据
        children: [],
        parents: projectItem ? [projectItem.id] : [],
        projects: [activeProjectId],
        refType: "white-board",
        refId: fullWhiteBoard.id,
        projectItemType: EProjectItemType.WhiteBoard,
        count: 0,
      };

      let item: ProjectItem | undefined;
      if (projectItem) {
        item = await createChildProjectItem(projectItem.id, createProjectItem);
      } else {
        item = await createRootProjectItem(activeProjectId, createProjectItem);
      }

      if (projectItem) {
        // 触发刷新
        const event = new CustomEvent("refreshProjectItem", {
          detail: {
            id: projectItem.id,
          },
        });
        document.dispatchEvent(event);
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
