import { projectsTranslator } from "@/features/projects/i18n";
import { useState } from "react";
import { useMemoizedFn } from "ahooks";

import { CreateProjectItem, EProjectItemType, ProjectItem, Whiteboard } from "@/types";
import { getWhiteboardById, addRootProjectItem, addChildProjectItem } from "@/commands";
import { toast } from "@tau/ui";

const useAddRefWhiteboard = (
  whiteboards: Whiteboard[],
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

  const onChange = useMemoizedFn((whiteboards: Whiteboard[]) => {
    setSelectedWhiteboards(whiteboards);
  });

  const onOk = useMemoizedFn(async (whiteboards: Whiteboard[]) => {
    if (whiteboards.length === 0) {
      toast.error(t("select.boardRequired"));
      return;
    }

    if (!projectId) {
      return;
    }

    try {
      // 目前只处理第一个白板（单选）
      const whiteboard = whiteboards[0];

      const fullWhiteboard = await getWhiteboardById(whiteboard.id);
      if (!fullWhiteboard || fullWhiteboard.whiteboardContentIds.length === 0) {
        toast.error(t("board.readFailed", { title: whiteboard.title }));
        return;
      }

      const whiteboardContentId = fullWhiteboard.whiteboardContentIds[0];

      const createProjectItem: CreateProjectItem = {
        title: fullWhiteboard.title,
        content: [],
        whiteboardContentId, // 使用原白板的数据
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
      toast.error(t("board.linkFailed"));
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
    whiteboards,
    excludeWhiteboardIds,
    multiple: false, // 目前都是单选
  };
};

export default useAddRefWhiteboard;

const t = projectsTranslator.t;
