import { useEffect, useMemo, useRef, useState } from "react";
import { Descendant } from "slate";
import { useTodoStore } from "@/stores/useTodoStore";
import TodoNotesDnd from "./TodoNotesDnd";
import { DatePicker, Empty, Select } from "antd";
import dayjs from "dayjs";
import sidebarRightIcon from "@/assets/icons/sidebar-right.svg";
import SVG from "react-inlinesvg";
import EditText, { EditTextHandle } from "@/components/EditText";
import Editor, { EditorRef } from "@/components/Editor";
import useEditContent from "@/hooks/useEditContent";
import { createContent } from "@/commands";
import { getContentLength } from "@/utils";
import { TodoItemType } from "@/types";

const DEFAULT_DESCRIPTION_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

const DetailsPanel = () => {
  const {
    setRightOpen,
    activeGroupId,
    itemsByGroupId,
    activeTodoId,
    updateItem,
    updateItemDescriptionContent,
  } = useTodoStore();
  const current = useMemo(() => {
    const items = itemsByGroupId[activeGroupId || -1] || [];
    return items.find((it) => it.id === activeTodoId);
  }, [activeGroupId, activeTodoId, itemsByGroupId]);

  const [title, setTitle] = useState(current?.title || "");

  const titleRef = useRef<EditTextHandle>(null);
  const descriptionEditorRef = useRef<EditorRef>(null);

  const { throttleHandleEditorContentChange } = useEditContent(
    current?.descriptionContentId ?? undefined,
    (content) => {
      descriptionEditorRef.current?.setEditorValue(content);
    },
  );

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

  const handleDescriptionChange = async (content: Descendant[]) => {
    if (!activeTodoId || !current) return;

    // 立即同步更新 store 中的 descriptionContent
    updateItemDescriptionContent(activeTodoId, current.groupId, content);

    // 判断内容是否为空
    const isEmpty =
      JSON.stringify(content) === JSON.stringify(DEFAULT_DESCRIPTION_CONTENT);

    // 如果已有 descriptionContentId，实时更新内容
    if (current.descriptionContentId) {
      if (!isEmpty) {
        // 内容不为空，更新 content（节流）
        throttleHandleEditorContentChange(content);
      }
    } else if (!isEmpty) {
      // 没有 contentId 且内容不为空，创建 content
      const contentId = await createContent(content, getContentLength(content));
      if (contentId) {
        await updateItem({ id: activeTodoId, descriptionContentId: contentId });
      }
    }
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

      {/* 任务类型选择 */}
      <div className="flex flex-col gap-3">
        <div className="text-xs opacity-60">任务类型</div>
        <Select
          value={current.type || "normal"}
          onChange={(value: TodoItemType) =>
            updateItem({ id: current.id, type: value })
          }
          className="w-full"
          options={[
            { value: "normal", label: "普通任务" },
            { value: "deadline", label: "截止任务" },
            { value: "planned", label: "计划任务" },
            { value: "recurring", label: "周期任务" },
          ]}
        />
      </div>

      {/* 截止日期 - 仅截止任务显示 */}
      {current.type === "deadline" && (
        <div className="flex flex-col gap-3">
          <div className="text-xs opacity-60">截止日期</div>
          <DatePicker
            showTime
            value={current.dueAt ? dayjs(current.dueAt) : null}
            onChange={(date) =>
              updateItem({
                id: current.id,
                dueAt: date ? date.valueOf() : null,
              })
            }
            allowClear
            placeholder="设置截止日期"
            className="flex-1 min-w-0"
          />
        </div>
      )}

      {/* 提醒时间 - 截止任务和计划任务显示 */}
      {(current.type === "deadline" || current.type === "planned") &&
        current.dueAt && (
          <div className="flex flex-col gap-3">
            <div className="text-xs opacity-60">提前提醒</div>
            <Select
              value={current.remindBefore || undefined}
              onChange={(value) =>
                updateItem({ id: current.id, remindBefore: value || null })
              }
              placeholder="不提醒"
              allowClear
              className="w-full"
              options={[
                { value: 0, label: "准时" },
                { value: 5 * 60 * 1000, label: "5分钟前" },
                { value: 10 * 60 * 1000, label: "10分钟前" },
                { value: 15 * 60 * 1000, label: "15分钟前" },
                { value: 30 * 60 * 1000, label: "30分钟前" },
                { value: 60 * 60 * 1000, label: "1小时前" },
                { value: 2 * 60 * 60 * 1000, label: "2小时前" },
                { value: 24 * 60 * 60 * 1000, label: "1天前" },
              ]}
            />
          </div>
        )}

      {/* 计划任务时间范围 */}
      {current.type === "planned" && (
        <>
          <div className="flex flex-col gap-3">
            <div className="text-xs opacity-60">开始时间</div>
            <DatePicker
              showTime
              value={current.startAt ? dayjs(current.startAt) : null}
              onChange={(date) =>
                updateItem({
                  id: current.id,
                  startAt: date ? date.valueOf() : null,
                })
              }
              allowClear
              placeholder="设置开始时间"
              className="flex-1 min-w-0"
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-xs opacity-60">结束时间</div>
            <DatePicker
              showTime
              value={current.dueAt ? dayjs(current.dueAt) : null}
              onChange={(date) =>
                updateItem({
                  id: current.id,
                  dueAt: date ? date.valueOf() : null,
                })
              }
              allowClear
              placeholder="设置结束时间"
              className="flex-1 min-w-0"
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <div className="text-xs opacity-60">描述</div>
        <div className="rounded-md px-4 py-2 min-h-[100px]">
          <Editor
            key={current.id}
            ref={descriptionEditorRef}
            initValue={
              current.descriptionContent || DEFAULT_DESCRIPTION_CONTENT
            }
            onChange={handleDescriptionChange}
            readonly={false}
            placeHolder="添加描述..."
            className="text-[12px] text-gray-600 dark:text-gray-200"
          />
        </div>
      </div>

      <div className="mt-4">
        <TodoNotesDnd key={current.id} todoId={current.id} />
      </div>
    </div>
  );
};

export default DetailsPanel;
