import { useEffect, useMemo, useRef, useState } from "react";
import { useTodoStore } from "@/stores/todo";
import TodoNotesDnd from "./TodoNotesDnd";
import { DatePicker, Empty } from "antd";
import dayjs from "dayjs";
import sidebarRightIcon from "@/assets/icons/sidebar-right.svg";
import SVG from "react-inlinesvg";
import EditText, { EditTextHandle } from "@/components/EditText";

const DetailsPanel = () => {
  const {
    setRightOpen,
    activeGroupId,
    itemsByGroupId,
    activeTodoId,
    updateItem,
  } = useTodoStore();
  const current = useMemo(() => {
    const items = itemsByGroupId[activeGroupId || -1] || [];
    return items.find((it) => it.id === activeTodoId);
  }, [activeGroupId, activeTodoId, itemsByGroupId]);

  const [title, setTitle] = useState(current?.title || "");

  const titleRef = useRef<EditTextHandle>(null);

  useEffect(() => {
    if (current) {
      titleRef.current?.setValue?.(current.title);
      setTitle(current.title);
    }
  }, [current]);

  const handleTitleChange = () => {
    if (!activeTodoId) return;
    updateItem({ id: activeTodoId, title: title.trim() });
  };

  if (!current)
    return (
      <div className="h-full p-4 flex flex flex-col bg-[#FCFAF8] dark:bg-[#292929]">
        <SVG
          className="cursor-pointer"
          src={sidebarRightIcon}
          onClick={() => setRightOpen(false)}
        />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Empty description="请选择一个任务查看详情" />
        </div>
      </div>
    );

  return (
    <div className="h-full p-4 space-y-4 overflow-auto bg-[#FCFAF8] dark:bg-[#292929]">
      <div className="flex items-center gap-2 h-8">
        <SVG
          className="cursor-pointer"
          src={sidebarRightIcon}
          onClick={() => setRightOpen(false)}
        />
        <EditText
          key={current.id}
          ref={titleRef}
          defaultValue={current.title}
          onChange={(value) => setTitle(value)}
          onPressEnter={handleTitleChange}
          contentEditable={true}
          className="flex-1 min-w-0 h-8 leading-8 font-bold text-[#455963] dark:text-white"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-xs opacity-60">截止日期</div>
        <DatePicker
          value={current.dueAt ? dayjs(current.dueAt) : null}
          onChange={(date) =>
            updateItem({ id: current.id, dueAt: date ? date.valueOf() : null })
          }
          allowClear
          placeholder="设置截止日期"
          className="flex-1 min-w-0"
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="text-xs opacity-60">描述</div>
        <EditText
          key={current.id}
          defaultValue={current.description || ""}
          onChange={(description) =>
            updateItem({ id: current.id, description: description || null })
          }
          contentEditable={true}
          className="flex-1 text-[12px] text-gray-600 dark:text-gray-200 min-w-0 min-h-[100px] border rounded-md p-2 border-gray-200 dark:border-gray-400/50"
        />
      </div>

      <div className="mt-4">
        <TodoNotesDnd key={current.id} todoId={current.id} />
      </div>
    </div>
  );
};

export default DetailsPanel;
