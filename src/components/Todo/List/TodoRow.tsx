import { useEffect, useRef } from "react";
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
import { TodoItemType } from "@/types";

export interface TodoRowProps {
  id: number;
  title: string;
  selected: boolean;
  isCompleted: boolean;
  depth: number;
  dueAt?: number | null;
  startAt?: number | null;
  type?: TodoItemType;
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
  } = useTodoStore();
  const { modal } = App.useApp();
  const editTextRef = useRef<EditTextHandle>(null);

  const themeColors = useThemeColors();

  const confirmToggle = () => {
    const checked = !isCompleted;
    toggleCompleteCascade(id, checked);
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
        return (
          <MdFlag
            size={12}
            className={isOverdue ? "text-red-500" : "text-orange-500"}
          />
        );
      case "planned":
        return <MdSchedule size={12} className="text-blue-500" />;
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
      onClick: (e) => {
        e.domEvent.stopPropagation();
        setActiveTodo(id);
        setRightOpen(true);
      },
    },
    {
      key: "edit",
      label: "编辑",
      icon: <MdEdit />,
      onClick: (e) => {
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
      onClick: (e) => {
        e.domEvent.stopPropagation();
        handleAddSubTask();
      },
    },
    {
      key: "add-above",
      label: "在上面添加任务",
      icon: <MdKeyboardArrowUp />,
      onClick: (e) => {
        e.domEvent.stopPropagation();
        handleAddTaskAbove();
      },
    },
    {
      key: "add-below",
      label: "在下面添加任务",
      icon: <MdKeyboardArrowDown />,
      onClick: (e) => {
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
        .filter((group) => !group.isSystem && group.id !== activeGroupId)
        .map((group) => ({
          key: `move-to-${group.id}`,
          label: (
            <div className="flex items-center gap-2">
              {group.color && (
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
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
      onClick: (e) => {
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
          "transition-all duration-200 px-3 py-1 rounded-lg",
          selected ? themeColors.activeClass : themeColors.hoverClass,
        )}
        style={{
          marginLeft: depth * 12,
        }}
        onDoubleClick={onStartEdit}
        onContextMenu={(e) => {
          e.stopPropagation();
          setActiveTodo(id);
        }}
      >
        <div className="flex gap-2 w-full">
          <div className="h-7 flex items-center flex-none">
            <CustomCheckbox
              checked={isCompleted}
              onChange={confirmToggle}
              className="mt-0 mb-[2px]"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {getTypeIcon()}
              <EditText
                ref={editTextRef}
                defaultValue={title}
                contentEditable={isEditing}
                defaultFocus={isEditing}
                className={classnames(
                  "flex-1 min-w-0 truncate flex items-center h-7 rounded text-[14px] transition-colors",
                  isCompleted ? "line-through opacity-60" : undefined,
                  themeColors.textClass,
                )}
                onChange={handleTitleChange}
                onBlur={onFinishEdit}
                onPressEnter={onFinishEdit}
              />
            </div>
            {(dueAt || startAt) && (
              <div className="text-[10px] flex items-center gap-1">
                {type === "planned" && startAt && (
                  <span
                    className={classnames(
                      "transition-colors",
                      themeColors.textClass,
                    )}
                  >
                    {dayjs(startAt).format("MM-DD HH:mm")}
                  </span>
                )}
                {type === "planned" && startAt && dueAt && (
                  <span
                    className={classnames(
                      "transition-colors",
                      themeColors.textClass,
                    )}
                  >
                    ~
                  </span>
                )}
                {dueAt && (
                  <span
                    className={classnames(
                      "text-[10px] transition-colors",
                      isOverdue
                        ? "text-red-500 font-semibold"
                        : themeColors.textClass,
                    )}
                  >
                    {dayjs(dueAt).format(
                      type === "planned" ? "MM-DD HH:mm" : "YYYY-MM-DD",
                    )}
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
