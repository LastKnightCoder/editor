import { useCreation, useMemoizedFn } from "ahooks";
import { getProjectItemById, moveProjectTreeItem } from "@/commands";
import { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import useProjectsStore from "@/stores/useProjectsStore";
import { defaultProjectItemEventBus } from "@/utils";
import { ProjectTreeData, canMoveProjectTreeItem } from "@/utils/projectTree";

const getInsertParentChildren = (
  treeData: ProjectTreeData,
  insertParentId?: number,
  insertParentIsRoot?: boolean
) => {
  if (typeof insertParentId !== "number") return undefined;
  if (insertParentIsRoot) {
    return treeData.nodes.map(node => node.item.id);
  }
  return treeData.itemMap.get(insertParentId)?.children;
};

interface MoveProjectItemParams {
  dragItem: IDragItem;
  dropTargetId: number;
  dropTargetParentId: number;
  dropTargetIsRoot: boolean;
  dragPosition: EDragPosition;
  childInsertIndex?: number;
  insertParentId?: number;
  insertParentIsRoot?: boolean;
  insertIndex?: number;
}

export const useProjectTreeOperations = ({
  projectId,
  treeData,
  refreshProject,
}: {
  projectId: number;
  treeData: ProjectTreeData;
  refreshProject?: () => void;
}) => {
  const projectItemEventBus = useCreation(() => defaultProjectItemEventBus.createEditor(), []);

  const publishUpdates = useMemoizedFn(async (ids: number[]) => {
    for (const id of [...new Set(ids)]) {
      const updatedProjectItem = await getProjectItemById(id);
      if (!updatedProjectItem) continue;
      projectItemEventBus.publishProjectItemEvent("project-item:updated", updatedProjectItem);
    }
  });

  const canMoveProjectItem = useMemoizedFn(
    (
      dragItem: IDragItem,
      dropTargetId: number,
      dragPosition: EDragPosition,
      insertParentId?: number,
      insertParentChildren?: number[],
      insertParentIsRoot?: boolean
    ) => {
      return canMoveProjectTreeItem({
        treeData,
        dragItem,
        dropTargetId,
        dragPosition,
        insertParentId,
        insertParentChildren,
        insertParentIsRoot,
      });
    }
  );

  const moveProjectItem = useMemoizedFn(async (params: MoveProjectItemParams) => {
    const { dragItem, dropTargetId, dragPosition, insertParentId, insertParentIsRoot } = params;

    if (
      !canMoveProjectItem(
        dragItem,
        dropTargetId,
        dragPosition,
        insertParentId,
        getInsertParentChildren(treeData, insertParentId, insertParentIsRoot),
        insertParentIsRoot
      )
    ) {
      return;
    }

    try {
      useProjectsStore.setState({ dragging: true });
      const result = await moveProjectTreeItem(projectId, params);
      refreshProject?.();
      if (result) {
        await publishUpdates(result.refreshItemIds);
      }
    } finally {
      useProjectsStore.setState({ dragging: false });
    }
  });

  return {
    canMoveProjectItem,
    moveProjectItem,
    publishUpdates,
  };
};
