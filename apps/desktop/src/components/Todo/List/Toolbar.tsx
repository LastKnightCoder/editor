import { useRef, useState, useMemo, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { useTodoStore } from "@/stores/useTodoStore";
import EditText, { EditTextHandle } from "@/components/EditText";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";
import { Dropdown, Button } from "antd";
import { TodoItemType } from "@/types";
import {
  FileTextOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import TaskDialog, { TaskCreationData } from "./TaskDialog";
import { emitTodoMutation, TODO_MUTATION_ACTIONS } from "@/mcp/todo/mutation";

// 任务类型配置
const TASK_TYPE_OPTIONS = [
  {
    key: "normal",
    label: "普通任务",
    icon: <FileTextOutlined />,
    shortcut: "N",
  },
  {
    key: "deadline",
    label: "截止任务",
    icon: <ClockCircleOutlined />,
    shortcut: "D",
  },
  {
    key: "planned",
    label: "计划任务",
    icon: <CalendarOutlined />,
    shortcut: "P",
  },
  {
    key: "recurring",
    label: "周期任务",
    icon: <SyncOutlined />,
    shortcut: "R",
  },
] as const;

const Toolbar = () => {
  const {
    activeGroupId,
    createItem,
    setFilters,
    groups,
    systemGroups,
    groupStats,
    filters,
    renameGroup,
    loadGroupStats,
  } = useTodoStore();

  const { isDark } = useTheme();

  // 当前选择的任务类型
  const [selectedTaskType, setSelectedTaskType] =
    useState<TodoItemType>("normal");

  // Modal状态
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingTaskTitle, setPendingTaskTitle] = useState("");

  const groupInfo = useMemo(() => {
    return (
      groups.find((group) => group.id === activeGroupId) ||
      systemGroups.find((group) => group.id === activeGroupId)
    );
  }, [activeGroupId, groups, systemGroups]);

  // 检查是否为系统组
  const isSystemGroup = useMemo(() => {
    return groupInfo?.isSystem ?? false;
  }, [groupInfo]);

  const [title, setTitle] = useState(groupInfo?.title || "");
  const titleRef = useRef<EditTextHandle>(null);

  const [taskValue, setTaskValue] = useState("");
  const taskValueRef = useRef<EditTextHandle>(null);

  const handleChangeGroupName = useMemoizedFn(async () => {
    if (!activeGroupId) return;
    await renameGroup({
      id: activeGroupId,
      title: title,
    });
    await loadGroupStats();
  });

  const handleCreateTask = useMemoizedFn(async () => {
    const t = taskValue.trim();
    if (!t || activeGroupId == null) return;

    // 如果是普通任务，直接创建
    if (selectedTaskType === "normal") {
      await createItem({
        groupId: activeGroupId,
        title: t,
        type: selectedTaskType,
      });
      setTaskValue("");
      taskValueRef.current?.setValue?.("");
      taskValueRef.current?.focus?.();
    } else {
      // 其他类型任务，先弹出Modal设置参数
      setPendingTaskTitle(t);
      setModalVisible(true);
    }
  });

  const handleModalConfirm = useMemoizedFn(async (data: TaskCreationData) => {
    if (!activeGroupId) return;

    const newItem = await createItem({
      groupId: activeGroupId,
      title: data.title,
      type: data.type,
      startAt: data.startAt,
      dueAt: data.dueAt,
      remindBefore: data.remindBefore,
    });

    // 如果是周期任务，创建重复规则
    if (data.type === "recurring" && data.recurrence) {
      const { createRecurrence } = await import("@/commands/todo");
      const recurrence = await createRecurrence({
        todoItemId: newItem.id,
        ...data.recurrence,
      });
      emitTodoMutation({
        source: "todo-toolbar",
        entityType: "recurrence",
        entityId: recurrence.id,
        relatedItemId: newItem.id,
        groupId: newItem.groupId,
        action: TODO_MUTATION_ACTIONS.CREATE_RECURRENCE,
        changedFields: ["type", "interval", "startDate", "endDate"],
      });
    }

    setTaskValue("");
    taskValueRef.current?.setValue?.("");
    taskValueRef.current?.focus?.();
    setModalVisible(false);
    setPendingTaskTitle("");
  });

  const handleModalCancel = useMemoizedFn(() => {
    setModalVisible(false);
    setPendingTaskTitle("");
    // 保持输入框的内容和焦点
    taskValueRef.current?.focus?.();
  });

  useEffect(() => {
    setTitle(groupInfo?.title || "");
    titleRef.current?.setValue?.(groupInfo?.title || "");
  }, [groupInfo?.title]);

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只在输入框获得焦点时响应快捷键
      if (!taskValueRef.current) return;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isModifier = isMac ? e.metaKey : e.ctrlKey;

      if (isModifier && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "n":
            e.preventDefault();
            setSelectedTaskType("normal");
            break;
          case "d":
            e.preventDefault();
            setSelectedTaskType("deadline");
            break;
          case "p":
            e.preventDefault();
            setSelectedTaskType("planned");
            break;
          case "r":
            e.preventDefault();
            setSelectedTaskType("recurring");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const options = [
    {
      label: "全部",
      value: "all",
      active: filters.completed === undefined && filters.overdue === undefined,
    },
    {
      label: "未完成",
      value: "todo",
      active: filters.completed === false,
    },
    {
      label: "已完成",
      value: "done",
      active: filters.completed === true,
    },
    {
      label: "已逾期",
      value: "overdue",
      active: filters.overdue === true,
    },
  ];

  if (!groupInfo || !activeGroupId) return null;

  return (
    <div className="flex flex-col gap-2 mt-5">
      <div className="flex">
        {isSystemGroup ? (
          // 系统组标题不可编辑
          <div className="flex-1 min-w-0 text-lg font-bold text-[#455963] dark:text-gray-400 px-5">
            {groupInfo?.title}
          </div>
        ) : (
          // 用户组标题可编辑
          <EditText
            ref={titleRef}
            defaultValue={title}
            onChange={setTitle}
            onPressEnter={handleChangeGroupName}
            contentEditable={true}
            className="flex-1 min-w-0 text-lg font-bold text-[#455963] dark:text-gray-400 px-5"
          />
        )}
      </div>
      <div className="flex px-5">
        <div className="text-[12px] text-gray-500">
          {groupStats[activeGroupId]?.total ?? 0} tasks
        </div>
        <div className="flex items-center ml-auto gap-2">
          {options.map((option) => (
            <div
              key={option.value}
              className={classNames(
                "text-[10px] text-[#8a9ca5] px-[6px] py-[2px] cursor-pointer rounded-full",
                {
                  "bg-[#7996a5] text-gray-100": option.active,
                },
              )}
              onClick={() => {
                setFilters({
                  completed:
                    option.value === "done"
                      ? true
                      : option.value === "todo"
                        ? false
                        : undefined,
                  overdue: option.value === "overdue" ? true : undefined,
                });
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>
      {/* 只有用户组才显示添加任务输入框 */}
      {!isSystemGroup && (
        <div className="mt-3 py-3 mx-5 px-0 flex items-center gap-2 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
          {/* 任务类型选择按钮 */}
          <Dropdown
            menu={{
              items: TASK_TYPE_OPTIONS.map((option) => ({
                key: option.key,
                label: (
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2">
                      {option.icon}
                      {option.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {navigator.platform.toUpperCase().indexOf("MAC") >= 0
                        ? "⌘"
                        : "Ctrl+"}
                      {option.shortcut}
                    </span>
                  </div>
                ),
                onClick: () => setSelectedTaskType(option.key as TodoItemType),
              })),
              selectedKeys: [selectedTaskType],
            }}
            trigger={["click"]}
          >
            <Button
              type="text"
              icon={
                TASK_TYPE_OPTIONS.find((opt) => opt.key === selectedTaskType)
                  ?.icon
              }
              className="flex items-center justify-center"
              title={`当前类型: ${TASK_TYPE_OPTIONS.find((opt) => opt.key === selectedTaskType)?.label}`}
            />
          </Dropdown>
          <EditText
            ref={taskValueRef}
            placeholder="添加任务..."
            placeholderStyle={{
              color: isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.6)",
            }}
            defaultValue={taskValue}
            onChange={setTaskValue}
            onPressEnter={handleCreateTask}
            contentEditable={true}
            defaultFocus
            className="text-[#455963] dark:text-[#8a9ca5] flex-1 min-w-0"
          />
        </div>
      )}
      <TaskDialog
        visible={modalVisible}
        taskType={selectedTaskType}
        taskTitle={pendingTaskTitle}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
      />
    </div>
  );
};

export default Toolbar;
