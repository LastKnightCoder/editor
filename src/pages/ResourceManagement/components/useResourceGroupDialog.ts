import { useState } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import type { ResourceGroup } from "@/types";

type AntdAppInstance = ReturnType<typeof App.useApp>;

type CreateResourceGroupFn = (
  name: string,
  parentId: number | null,
) => Promise<unknown>;

type UpdateResourceGroupFn = (
  groupId: number,
  name: string,
) => Promise<unknown>;

type DeleteResourceGroupFn = (groupId: number) => Promise<unknown>;

interface UseResourceGroupDialogParams {
  groups: ResourceGroup[];
  createResourceGroup: CreateResourceGroupFn;
  updateResourceGroup: UpdateResourceGroupFn;
  deleteResourceGroup: DeleteResourceGroupFn;
  app: AntdAppInstance;
}

export function useResourceGroupDialog({
  groups,
  createResourceGroup,
  updateResourceGroup,
  deleteResourceGroup,
  app,
}: UseResourceGroupDialogParams) {
  const { message: messageApi, modal } = app;

  const [groupDialogVisible, setGroupDialogVisible] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<"create" | "edit">(
    "create",
  );
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupParentId, setEditingGroupParentId] = useState<
    number | null
  >(null);
  const [groupName, setGroupName] = useState("");

  const handleCreateGroup = useMemoizedFn((parentId?: number | null) => {
    setGroupDialogMode("create");
    setEditingGroupParentId(parentId ?? null);
    setGroupName("");
    setGroupDialogVisible(true);
  });

  const handleEditGroup = useMemoizedFn((groupId: number) => {
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setGroupDialogMode("edit");
      setEditingGroupId(groupId);
      setGroupName(group.name);
      setGroupDialogVisible(true);
    }
  });

  const handleDeleteGroup = useMemoizedFn((groupId: number) => {
    modal.confirm({
      title: "删除分组",
      content: "确定要删除这个分组吗？分组下的资源将移到未分组。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteResourceGroup(groupId);
          messageApi.success("分组已删除");
        } catch (error) {
          const err = error as Error;
          messageApi.error(err.message || "删除失败");
        }
      },
    });
  });

  const handleGroupDialogOk = useMemoizedFn(async () => {
    if (!groupName.trim()) {
      messageApi.warning("请输入分组名称");
      return;
    }

    try {
      if (groupDialogMode === "create") {
        await createResourceGroup(groupName, editingGroupParentId);
        messageApi.success("分组已创建");
      } else if (editingGroupId) {
        await updateResourceGroup(editingGroupId, groupName);
        messageApi.success("分组已更新");
      }
      setGroupDialogVisible(false);
      setGroupName("");
      setEditingGroupId(null);
      setEditingGroupParentId(null);
    } catch (error) {
      const err = error as Error;
      messageApi.error(err.message || "操作失败");
    }
  });

  const closeGroupDialog = useMemoizedFn(() => {
    setGroupDialogVisible(false);
    setGroupName("");
    setEditingGroupId(null);
    setEditingGroupParentId(null);
  });

  return {
    groupDialogVisible,
    groupDialogMode,
    editingGroupId,
    editingGroupParentId,
    groupName,
    setGroupName,
    handleCreateGroup,
    handleEditGroup,
    handleDeleteGroup,
    handleGroupDialogOk,
    closeGroupDialog,
  };
}
