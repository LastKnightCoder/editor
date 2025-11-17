import { useState } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import type { IResource } from "@/types";

type MoveResourceToGroupFn = (
  resourceId: number,
  groupId: number | null,
) => Promise<unknown>;

interface UseResourceDragAndDropParams {
  resources: IResource[];
  moveResourceToGroup: MoveResourceToGroupFn;
}

export function useResourceDragAndDrop({
  resources,
  moveResourceToGroup,
}: UseResourceDragAndDropParams) {
  const { message: messageApi } = App.useApp();

  const [draggedResourceId, setDraggedResourceId] = useState<number | null>(
    null,
  );
  const [dragOverTarget, setDragOverTarget] = useState<number | null>(null);

  const handleDragStart = useMemoizedFn(
    (e: React.DragEvent, resourceId: number) => {
      setDraggedResourceId(resourceId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", resourceId.toString());
    },
  );

  const handleDragEnd = useMemoizedFn(() => {
    setDraggedResourceId(null);
    setDragOverTarget(null);
  });

  const handleDragOver = useMemoizedFn(
    (e: React.DragEvent, targetGroupId: number | null) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDragOverTarget(targetGroupId);
    },
  );

  const handleDragLeave = useMemoizedFn((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setDragOverTarget(null);
    }
  });

  const handleDrop = useMemoizedFn(
    async (e: React.DragEvent, targetGroupId: number | null) => {
      e.preventDefault();
      e.stopPropagation();

      if (!draggedResourceId) return;

      const resource = resources.find((r) => r.id === draggedResourceId);
      if (!resource) {
        setDraggedResourceId(null);
        setDragOverTarget(null);
        return;
      }

      if (resource.groupId === targetGroupId) {
        setDraggedResourceId(null);
        setDragOverTarget(null);
        return;
      }

      try {
        await moveResourceToGroup(draggedResourceId, targetGroupId);
        messageApi.success(targetGroupId ? "已移动到分组" : "已移到未分组");
      } catch (error) {
        messageApi.error("移动失败");
      } finally {
        setDraggedResourceId(null);
        setDragOverTarget(null);
      }
    },
  );

  return {
    draggedResourceId,
    dragOverTarget,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
