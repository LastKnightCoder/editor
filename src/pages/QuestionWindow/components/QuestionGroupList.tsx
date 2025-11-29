import { useState, memo } from "react";
import { useMemoizedFn } from "ahooks";
import { type ProjectColorName } from "@/constants/project-colors";
import CustomModal from "@/components/CustomModal";
import GroupForm from "./GroupForm";
import GroupItem, { type QuestionGroup, type GroupStats } from "./GroupItem";
import SidebarHeader from "./SidebarHeader";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

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
    const themeColors = useThemeColors();

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

    const createIcon = (
      <svg
        className="w-5 h-5 text-indigo-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 5v14M5 12h14" />
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    );

    const editIcon = (
      <svg
        className="w-5 h-5 text-amber-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    );

    return (
      <>
        <div
          className={classNames(
            "w-full h-full flex flex-col border-r",
            themeColors.borderClass,
          )}
        >
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
        <CustomModal
          open={createModalOpen}
          onCancel={() => setCreateModalOpen(false)}
          width={480}
          showCloseButton={false}
          icon={createIcon}
          iconBgColor="bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30"
        >
          <GroupForm
            title="添加分组"
            onCancel={() => setCreateModalOpen(false)}
            onSubmit={handleCreateSubmit}
            submitText="添加"
          />
        </CustomModal>
        <CustomModal
          open={editModalOpen}
          onCancel={handleEditCancel}
          width={480}
          showCloseButton={false}
          icon={editIcon}
          iconBgColor="bg-amber-50 dark:bg-amber-500/20 border-amber-200 dark:border-amber-500/30"
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
        </CustomModal>
      </>
    );
  },
);

QuestionGroupList.displayName = "QuestionGroupList";

export default QuestionGroupList;
