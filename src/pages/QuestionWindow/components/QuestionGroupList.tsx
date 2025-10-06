import { useState, memo } from "react";
import { Modal } from "antd";
import { useMemoizedFn } from "ahooks";
import { type ProjectColorName } from "@/constants/project-colors";
import GroupForm from "./GroupForm";
import GroupItem, { type QuestionGroup, type GroupStats } from "./GroupItem";
import SidebarHeader from "./SidebarHeader";

interface QuestionGroupListProps {
  groups: QuestionGroup[];
  groupStats: Record<number, GroupStats>;
  activeGroupId: number | null;
  onSetActive: (groupId: number) => void;
  onCreateGroup: (title: string, color?: string) => Promise<void>;
  onUpdateGroup: (payload: {
    id: number;
    title?: string;
    color?: string;
  }) => Promise<void>;
  onDeleteGroup: (groupId: number) => Promise<void>;
  onReorderGroups: (orderedIds: number[]) => Promise<void> | void;
}

const QuestionGroupList = memo(
  ({
    groups,
    groupStats,
    activeGroupId,
    onSetActive,
    onCreateGroup,
    onUpdateGroup,
    onDeleteGroup,
    onReorderGroups,
  }: QuestionGroupListProps) => {
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<QuestionGroup | null>(
      null,
    );

    const handleCreateSubmit = useMemoizedFn(
      async (title: string, color: ProjectColorName) => {
        await onCreateGroup(title, color);
        setCreateModalOpen(false);
      },
    );

    const handleEditSubmit = useMemoizedFn(
      async (title: string, color: ProjectColorName) => {
        if (!editingGroup) return;
        await onUpdateGroup({
          id: editingGroup.id,
          title: editingGroup.isDefault ? undefined : title,
          color,
        });
        setEditModalOpen(false);
        setEditingGroup(null);
      },
    );

    const handleEditClick = useMemoizedFn((group: QuestionGroup) => {
      setEditingGroup(group);
      setEditModalOpen(true);
    });

    const handleEditCancel = useMemoizedFn(() => {
      setEditModalOpen(false);
      setEditingGroup(null);
    });

    const onMove = useMemoizedFn(
      (dragId: number, hoverId: number, place: "before" | "after") => {
        const arr = [...groups];
        const from = arr.findIndex((x) => x.id === dragId);
        const to = arr.findIndex((x) => x.id === hoverId);
        if (from < 0 || to < 0 || from === to) return;
        const [moved] = arr.splice(from, 1);
        const insertAt = place === "before" ? to : to + 1;
        arr.splice(insertAt > from ? insertAt - 1 : insertAt, 0, moved);
        onReorderGroups(arr.map((x) => x.id));
      },
    );

    return (
      <>
        <div className="w-full h-full flex flex-col bg-[#FCFAF8] dark:bg-[#292929]">
          <SidebarHeader onCreate={() => setCreateModalOpen(true)} />
          <div className="flex-1 overflow-auto">
            {groups.map((g) => (
              <GroupItem
                key={g.id}
                id={g.id}
                title={g.title}
                color={g.color as ProjectColorName | undefined}
                isDefault={g.isDefault}
                active={activeGroupId === g.id}
                onClick={() => onSetActive(g.id)}
                onMove={onMove}
                onEditClick={() => handleEditClick(g)}
                onDeleteClick={() => onDeleteGroup(g.id)}
                stats={groupStats[g.id]}
              />
            ))}
          </div>
        </div>
        <Modal
          open={createModalOpen}
          onCancel={() => setCreateModalOpen(false)}
          footer={null}
          destroyOnClose
          width={480}
          closable={false}
        >
          <GroupForm
            title="添加分组"
            onCancel={() => setCreateModalOpen(false)}
            onSubmit={handleCreateSubmit}
            submitText="添加"
          />
        </Modal>
        <Modal
          open={editModalOpen}
          onCancel={handleEditCancel}
          footer={null}
          destroyOnClose
          width={480}
          closable={false}
        >
          <GroupForm
            title="编辑分组"
            initialData={
              editingGroup
                ? {
                    title: editingGroup.title,
                    color: editingGroup.color as ProjectColorName,
                    isDefault: editingGroup.isDefault,
                  }
                : undefined
            }
            onCancel={handleEditCancel}
            onSubmit={handleEditSubmit}
            submitText="保存"
          />
        </Modal>
      </>
    );
  },
);

QuestionGroupList.displayName = "QuestionGroupList";

export default QuestionGroupList;
