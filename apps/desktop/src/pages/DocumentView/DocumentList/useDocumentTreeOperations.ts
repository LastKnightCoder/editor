import { useCreation, useMemoizedFn } from "ahooks";
import { getDocumentItemsByIds, moveDocumentTreeItem } from "@/commands";
import { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import { defaultDocumentItemEventBus } from "@/utils";
import { DocumentTreeData, canMoveDocumentTreeItem } from "./documentTree";

const getInsertParentChildren = (
  treeData: DocumentTreeData,
  insertParentId?: number,
  insertParentIsRoot?: boolean,
) => {
  if (typeof insertParentId !== "number") return undefined;
  if (insertParentIsRoot) {
    return treeData.nodes.map((node) => node.item.id);
  }
  return treeData.itemMap.get(insertParentId)?.children;
};

interface MoveDocumentItemParams {
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

export const useDocumentTreeOperations = ({
  documentId,
  treeData,
  refreshDocument,
}: {
  documentId: number;
  treeData: DocumentTreeData;
  refreshDocument?: () => void;
}) => {
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );

  const publishUpdates = useMemoizedFn(async (ids: number[]) => {
    const updatedDocumentItems = await getDocumentItemsByIds([...new Set(ids)]);
    updatedDocumentItems.forEach((updatedDocumentItem) => {
      if (!updatedDocumentItem) return;
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    });
  });

  const canMoveDocumentItem = useMemoizedFn(
    (
      dragItem: IDragItem,
      dropTargetId: number,
      dragPosition: EDragPosition,
      insertParentId?: number,
      insertParentChildren?: number[],
      insertParentIsRoot?: boolean,
    ) => {
      return canMoveDocumentTreeItem({
        treeData,
        dragItem,
        dropTargetId,
        dragPosition,
        insertParentId,
        insertParentChildren,
        insertParentIsRoot,
      });
    },
  );

  const moveDocumentItem = useMemoizedFn(
    async (params: MoveDocumentItemParams) => {
      const {
        dragItem,
        dropTargetId,
        dragPosition,
        insertParentId,
        insertParentIsRoot,
      } = params;

      if (
        !canMoveDocumentItem(
          dragItem,
          dropTargetId,
          dragPosition,
          insertParentId,
          getInsertParentChildren(treeData, insertParentId, insertParentIsRoot),
          insertParentIsRoot,
        )
      ) {
        return;
      }

      const result = await moveDocumentTreeItem(documentId, params);
      if (
        result &&
        (dragItem.isRoot ||
          (dragPosition !== EDragPosition.Inside && params.dropTargetIsRoot))
      ) {
        refreshDocument?.();
      }
      if (result) {
        await publishUpdates(result.refreshItemIds);
      }
    },
  );

  return {
    canMoveDocumentItem,
    moveDocumentItem,
    publishUpdates,
  };
};
