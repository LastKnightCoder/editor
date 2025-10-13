import { useRef, useState, useMemo, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { useTodoStore } from "@/stores/useTodoStore";
import EditText, { EditTextHandle } from "@/components/EditText";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";

const Toolbar = () => {
  const {
    activeGroupId,
    createItem,
    setFilters,
    groups,
    groupStats,
    filters,
    renameGroup,
    loadGroupStats,
  } = useTodoStore();

  const { isDark } = useTheme();

  const groupInfo = useMemo(() => {
    return groups.find((group) => group.id === activeGroupId);
  }, [activeGroupId, groups]);

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
    await createItem({ groupId: activeGroupId, title: t });
    setTaskValue("");
    taskValueRef.current?.setValue?.("");
    taskValueRef.current?.focus?.();
  });

  useEffect(() => {
    setTitle(groupInfo?.title || "");
    titleRef.current?.setValue?.(groupInfo?.title || "");
  }, [groupInfo?.title]);

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
        <EditText
          ref={titleRef}
          defaultValue={title}
          onChange={setTitle}
          onPressEnter={handleChangeGroupName}
          contentEditable={true}
          className="flex-1 min-w-0 text-lg font-bold text-[#455963] dark:text-gray-400 px-5"
        />
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
      <div className="mt-3 py-3 mx-5 px-0 flex items-center border-b border-[#e2e4ea] dark:border-[#455963]">
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
    </div>
  );
};

export default Toolbar;
