import { useEffect, useRef, useMemo } from "react";
import { useTodoStore } from "@/stores/useTodoStore";
import { App, Dropdown, MenuProps } from "antd";
import dayjs from "dayjs";
import {
  MdAdd,
  MdDelete,
  MdKeyboardArrowUp,
  MdKeyboardArrowDown,
  MdEdit,
  MdInfo,
  MdFlag,
  MdSchedule,
  MdLoop,
  MdDriveFileMove,
} from "react-icons/md";
import CustomCheckbox from "@/components/CustomCheckbox";
import EditText, { EditTextHandle } from "@/components/EditText";
import classnames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { TodoItemType, TodoRecurrence } from "@/types";
import { useRecurringTaskStatus } from "@/hooks/useRecurringTaskStatus";
import { completeRecurrence, uncompleteRecurrence } from "@/commands/todo";
import { getTodayNormalized, getStartOfDayTimestamp } from "@/utils/recurrence";
import { emitTodoMutation, TODO_MUTATION_ACTIONS } from "@/mcp/todo/mutation";

export interface TodoRowProps {
  id: number;
  title: string;
  selected: boolean;
  isCompleted: boolean;
  depth: number;
  dueAt?: number | null;
  startAt?: number | null;
  type?: TodoItemType;
  recurrence?: TodoRecurrence | null;
  index: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  isDark?: boolean;
}

const TodoRow = ({
  id,
  title,
  selected,
  isCompleted,
  depth,
  dueAt,
  startAt,
  type = "normal",
  recurrence,
  isEditing,
  onStartEdit,
  onFinishEdit,
}: TodoRowProps) => {
  const {
    toggleCompleteCascade,
    updateItem,
    createItemRelative,
    deleteItemCascade,
    activeGroupId,
    setRightOpen,
    setActiveTodo,
    groups,
    moveAndReorder,
    loadItems,
    loadGroupStats,
    systemGroups,
  } = useTodoStore();
  const { modal } = App.useApp();
  const editTextRef = useRef<EditTextHandle>(null);

  const themeColors = useThemeColors();

  // For recurring tasks, get today's completion status
  const todoItemForHook = useMemo(
    () =>
      type === "recurring"
        ? {
            id,
            type,
            recurrence,
            groupId: activeGroupId ?? 0,
            parentId: null,
            title,
            isCompleted,
            sortIndex: 0,
            isArchived: false,
            createTime: 0,
            updateTime: 0,
          }
        : null,
    [id, type, recurrence, activeGroupId, title, isCompleted]
  );

  const recurringStatus = useRecurringTaskStatus(todoItemForHook);

  // Determine the effective checked state
  const effectiveChecked = useMemo(() => {
    if (type === "recurring") {
      return recurringStatus.isTodayCompleted;
    }
    return isCompleted;
  }, [type, isCompleted, recurringStatus.isTodayCompleted]);

  const confirmToggle = async () => {
    if (type === "recurring") {
      // Handle recurring task toggle
      if (!recurringStatus.recurrence) {
        console.error("Cannot toggle recurring task without recurrence config");
        return;
      }

      if (!recurringStatus.isTodayScheduled) {
        // Show a message that today is not a scheduled day
        modal.warning({
          title: "今天不是计划打卡日",
          content: "根据您设置的周期规则，今天不需要完成此任务。",
        });
        return;
      }

      const today = getStartOfDayTimestamp(getTodayNormalized());

      try {
        if (recurringStatus.isTodayCompleted) {
          // Uncomplete today
          await uncompleteRecurrence(recurringStatus.recurrence.id, today);
          emitTodoMutation({
            source: "todo-row",
            entityType: "recurrence",
            entityId: recurringStatus.recurrence.id,
            relatedItemId: id,
            groupId: activeGroupId,
            action: TODO_MUTATION_ACTIONS.UNCOMPLETE_OCCURRENCE,
            changedFields: ["completedAt"],
          });
        } else {
          // Complete today
          await completeRecurrence(recurringStatus.recurrence.id, today);
          emitTodoMutation({
            source: "todo-row",
            entityType: "recurrence",
            entityId: recurringStatus.recurrence.id,
            relatedItemId: id,
            groupId: activeGroupId,
            action: TODO_MUTATION_ACTIONS.COMPLETE_OCCURRENCE,
            changedFields: ["completedAt"],
          });
        }

        // Reload the items to reflect the change
        const gid = activeGroupId;
        if (gid != null) {
          const systemGroup = systemGroups.find(g => g.id === gid);
          if (systemGroup?.systemType) {
            await useTodoStore.getState().loadItemsByType(systemGroup.systemType);
          } else {
            await loadItems(gid);
          }
        }
        await loadGroupStats();
      } catch (error) {
        console.error("Failed to toggle recurring task:", error);
        modal.error({
          title: "操作失败",
          content: "无法更新任务状态，请稍后重试。",
        });
      }
    } else {
      // Existing logic for non-recurring tasks
      const checked = !isCompleted;
      await toggleCompleteCascade(id, checked);
    }
  };

  const handleTitleChange = (newTitle: string) => {
    if (newTitle.trim() && newTitle !== title) {
      updateItem({ id, title: newTitle.trim() });
    }
  };

  useEffect(() => {
    if (!isEditing) {
      editTextRef.current?.setValue?.(title);
    }
  }, [isEditing, title]);

  const handleAddSubTask = async () => {
    if (!activeGroupId) return;
    await createItemRelative({
      refId: id,
      position: "child",
      title: "新子任务",
    });
  };

  const handleDeleteTask = () => {
    modal.confirm({
      title: "确定删除此任务吗？",
      content: "删除后将递归删除所有子任务，且不可恢复",
      okButtonProps: {
        danger: true,
      },
      onOk: () => deleteItemCascade(id),
    });
  };

  const handleAddTaskAbove = async () => {
    if (!activeGroupId) return;
    await createItemRelative({ refId: id, position: "above", title: "新任务" });
  };

  const handleAddTaskBelow = async () => {
    if (!activeGroupId) return;
    await createItemRelative({ refId: id, position: "below", title: "新任务" });
  };

  const handleMoveToProject = async (targetGroupId: number) => {
    if (!activeGroupId || activeGroupId === targetGroupId) return;
    await moveAndReorder({
      id,
      toGroupId: targetGroupId,
      toParentId: null,
    });
  };

  // 判断是否逾期
  const isOverdue = dueAt && !isCompleted && Date.now() > dueAt;

  // 获取任务类型图标
  const getTypeIcon = () => {
    switch (type) {
      case "deadline":
        return <MdFlag size={12} className={isOverdue ? "text-red-500" : "text-orange-500"} />;
      case "planned":
        return <MdSchedule size={12} className="text-[var(--th-accent)]" />;
      case "recurring":
        return <MdLoop size={12} className="text-green-500" />;
      default:
        return null;
    }
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "view-detail",
      label: "查看详情",
      icon: <MdInfo />,
      onClick: e => {
        e.domEvent.stopPropagation();
        setActiveTodo(id);
        setRightOpen(true);
      },
    },
    {
      key: "edit",
      label: "编辑",
      icon: <MdEdit />,
      onClick: e => {
        e.domEvent.stopPropagation();
        onStartEdit();
      },
    },
    {
      type: "divider" as const,
    },
    {
      key: "add-subtask",
      label: "添加子任务",
      icon: <MdAdd />,
      onClick: e => {
        e.domEvent.stopPropagation();
        handleAddSubTask();
      },
    },
    {
      key: "add-above",
      label: "在上面添加任务",
      icon: <MdKeyboardArrowUp />,
      onClick: e => {
        e.domEvent.stopPropagation();
        handleAddTaskAbove();
      },
    },
    {
      key: "add-below",
      label: "在下面添加任务",
      icon: <MdKeyboardArrowDown />,
      onClick: e => {
        e.domEvent.stopPropagation();
        handleAddTaskBelow();
      },
    },
    {
      type: "divider" as const,
    },
    {
      key: "move-to",
      label: "移动至",
      icon: <MdDriveFileMove />,
      children: groups
        .filter(group => !group.isSystem && group.id !== activeGroupId)
        .map(group => ({
          key: `move-to-${group.id}`,
          label: (
            <div className="flex items-center gap-2">
              {group.color && (
                <div
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
              )}
              <span>{group.title}</span>
            </div>
          ),
          onClick: (e: any) => {
            e.domEvent.stopPropagation();
            handleMoveToProject(group.id);
          },
        })),
    },
    {
      type: "divider" as const,
    },
    {
      key: "delete",
      label: "删除任务",
      icon: <MdDelete />,
      onClick: e => {
        e.domEvent.stopPropagation();
        handleDeleteTask();
      },
      danger: true,
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
      <div
        className={classnames(
          "rounded-lg px-3 py-1 transition-all duration-200",
          selected ? themeColors.activeClass : themeColors.hoverClass
        )}
        style={{
          marginLeft: depth * 12,
        }}
        onDoubleClick={onStartEdit}
        onContextMenu={e => {
          e.stopPropagation();
          setActiveTodo(id);
        }}
      >
        <div className="flex w-full gap-2">
          <div className="flex h-7 flex-none items-center">
            <CustomCheckbox
              checked={effectiveChecked}
              onChange={confirmToggle}
              className="mb-[2px] mt-0"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {getTypeIcon()}
              <EditText
                ref={editTextRef}
                defaultValue={title}
                contentEditable={isEditing}
                defaultFocus={isEditing}
                className={classnames(
                  "flex h-7 min-w-0 flex-1 items-center truncate rounded text-[14px] transition-colors",
                  effectiveChecked ? "line-through opacity-60" : undefined,
                  themeColors.textClass
                )}
                onChange={handleTitleChange}
                onBlur={onFinishEdit}
                onPressEnter={onFinishEdit}
              />
            </div>
            {(dueAt || startAt) && (
              <div className="flex items-center gap-1 text-[10px]">
                {type === "planned" && startAt && (
                  <span className={classnames("transition-colors", themeColors.textClass)}>
                    {dayjs(startAt).format("MM-DD HH:mm")}
                  </span>
                )}
                {type === "planned" && startAt && dueAt && (
                  <span className={classnames("transition-colors", themeColors.textClass)}>~</span>
                )}
                {dueAt && (
                  <span
                    className={classnames(
                      "text-[10px] transition-colors",
                      isOverdue ? "font-semibold text-red-500" : themeColors.textClass
                    )}
                  >
                    {dayjs(dueAt).format(type === "planned" ? "MM-DD HH:mm" : "YYYY-MM-DD")}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Dropdown>
  );
};

export default TodoRow;
