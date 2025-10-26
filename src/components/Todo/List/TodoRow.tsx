import { useEffect, useRef } from "react";
import { useTodoStore } from "@/stores/useTodoStore";
import { App, Dropdown, MenuProps } from "antd";
import dayjs from "dayjs";
import {
  MdMoreVert,
  MdAdd,
  MdDelete,
  MdKeyboardArrowUp,
  MdKeyboardArrowDown,
  MdEdit,
  MdInfo,
} from "react-icons/md";
import CustomCheckbox from "@/components/CustomCheckbox";
import EditText, { EditTextHandle } from "@/components/EditText";
import classnames from "classnames";
import useTheme from "@/hooks/useTheme";

export interface TodoRowProps {
  id: number;
  title: string;
  selected: boolean;
  isCompleted: boolean;
  depth: number;
  dueAt?: number | null;
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
  } = useTodoStore();
  const { modal } = App.useApp();
  const editTextRef = useRef<EditTextHandle>(null);

  const { isDark } = useTheme();

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

  const menuItems: MenuProps["items"] = [
    {
      key: "view-detail",
      label: "查看详情",
      icon: <MdInfo />,
      onClick: (e) => {
        e.domEvent.stopPropagation();
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
    <div
      className={classnames(
        "transition-all duration-200 px-3 py-1 rounded-lg",
        {
          "hover:bg-[#1a1a1a]": !selected && isDark,
          "hover:bg-[#f6fbff]": !selected && !isDark,
          "bg-blue-500/10": selected && isDark,
          "bg-blue-500/5": selected && !isDark,
        },
      )}
      style={{
        marginLeft: depth * 12,
      }}
      onDoubleClick={onStartEdit}
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
          <EditText
            ref={editTextRef}
            defaultValue={title}
            contentEditable={isEditing}
            defaultFocus={isEditing}
            className={classnames(
              "w-full truncate flex items-center h-7 rounded text-[14px]",
              isCompleted ? "line-through opacity-60" : undefined,
              isDark ? "text-gray-200" : "text-gray-900",
            )}
            onChange={handleTitleChange}
            onBlur={onFinishEdit}
            onPressEnter={onFinishEdit}
          />
          {dueAt && (
            <div className="text-[10px] text-gray-500 dark:text-gray-400">
              {dayjs(dueAt).format("YYYY-MM-DD")}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Dropdown
            menu={{ items: menuItems }}
            trigger={["click"]}
            placement="bottomRight"
          >
            <button
              className={classnames(
                "p-1.5 rounded-full cursor-pointer flex items-center justify-center",
                isDark
                  ? "text-gray-400 hover:text-gray-300 hover:bg-white/10"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-500/10",
              )}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <MdMoreVert size={16} />
            </button>
          </Dropdown>
        </div>
      </div>
    </div>
  );
};

export default TodoRow;
