import { useState } from "react";
import { useMemoizedFn } from "ahooks";

import { CreateProjectItem, EProjectItemType, ProjectItem, Whiteboard } from "@/types";
import { getWhiteboardById, addRootProjectItem, addChildProjectItem } from "@/commands";
import { toast } from "@tau/ui";

const useAddRefWhiteboard = (
  whiteBoards: Whiteboard[],
  projectId: number,
  projectItem?: ProjectItem
) => {
  const [selectWhiteboardModalOpen, setSelectWhiteboardModalOpen] = useState(false);
  const [selectedWhiteboards, setSelectedWhiteboards] = useState<Whiteboard[]>([]);

  const excludeWhiteboardIds =
    projectItem?.refType === "white-board" && projectItem?.refId ? [projectItem.refId] : [];

  const openSelectWhiteboardModal = useMemoizedFn(async () => {
    setSelectedWhiteboards([]);
    setSelectWhiteboardModalOpen(true);
  });

  const onChange = useMemoizedFn((whiteBoards: Whiteboard[]) => {
    setSelectedWhiteboards(whiteBoards);
  });

  const onOk = useMemoizedFn(async (whiteBoards: Whiteboard[]) => {
    if (whiteBoards.length === 0) {
      toast.error("请选择白板");
      return;
    }

    if (!projectId) {
      return;
    }

    try {
      // 目前只处理第一个白板（单选）
      const whiteBoard = whiteBoards[0];

      const fullWhiteboard = await getWhiteboardById(whiteBoard.id);
      if (!fullWhiteboard || fullWhiteboard.whiteBoardContentIds.length === 0) {
        toast.error(`获取白板 ${whiteBoard.title} 数据失败`);
        return;
      }

      const whiteBoardContentId = fullWhiteboard.whiteBoardContentIds[0];

      const createProjectItem: CreateProjectItem = {
        title: fullWhiteboard.title,
        content: [],
        whiteBoardContentId, // 使用原白板的数据
        children: [],
        refType: "white-board",
        refId: fullWhiteboard.id,
        projectItemType: EProjectItemType.Whiteboard,
        count: 0,
      };

      setSelectWhiteboardModalOpen(false);
      if (projectItem) {
        return await addChildProjectItem(projectItem.id, createProjectItem);
      } else {
        return await addRootProjectItem(projectId, createProjectItem);
      }
    } catch (e) {
      console.error(e);
      toast.error("关联白板失败");
    }
  });

  const onCancel = useMemoizedFn(() => {
    setSelectWhiteboardModalOpen(false);
  });

  return {
    selectWhiteboardModalOpen,
    openSelectWhiteboardModal,
    selectedWhiteboards,
    onChange,
    onOk,
    onCancel,
    whiteBoards,
    excludeWhiteboardIds,
    multiple: false, // 目前都是单选
  };
};

export default useAddRefWhiteboard;
