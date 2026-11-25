import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { isHotkey } from "is-hotkey";
import { Plus } from "lucide-react";

import { Popover, Tag as TauTag, cn } from "@tau/ui";
import Tags from "@/components/Tags";
import type { TagCount } from "@/utils/tags";
import { TagPickerPanel } from "./TagPickerPanel";

/** 可编辑标签行比纯展示标签高一档，点击与输入更从容 */
const TAG_SIZE_CLASS = "text-tau-meta h-[26px] px-2.5";

interface AddTagProps {
  tags: string[];
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  editTag?: (oldTag: string, newTag: string) => void;
  readonly?: boolean;
  /** 正文末标签行：自带上分割线与留白，与正文最后一块（段落/代码块…）的外边距无关 */
  divided?: boolean;
  className?: string;
  style?: React.CSSProperties;
  // 拖拽排序相关
  onReorder?: (newTags: string[]) => void;
  /** 选择器候选来源：每次打开时取一次（拿到的是最新计数）；不传则只能新建 */
  loadSuggestions?: () => Promise<TagCount[]>;
}

const AddTag = (props: AddTagProps) => {
  const {
    tags,
    addTag,
    removeTag,
    editTag,
    readonly = false,
    divided = false,
    className,
    style,
    onReorder,
    loadSuggestions,
  } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TagCount[]>([]);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const editRef = useRef<HTMLDivElement>(null);
  // 进入编辑时的点击坐标，供首帧绘制前定位光标
  const editClickPointRef = useRef<{ x: number; y: number } | null>(null);

  const loadSuggestionsRef = useRef(loadSuggestions);
  loadSuggestionsRef.current = loadSuggestions;
  useEffect(() => {
    const load = loadSuggestionsRef.current;
    if (!pickerOpen || !load) return;
    let alive = true;
    load()
      .then(list => alive && setSuggestions(list))
      .catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
  }, [pickerOpen]);

  const handlePick = useCallback(
    (input: string) => {
      const tag = input.trim();
      if (tag && !tags.includes(tag)) addTag(tag);
    },
    [addTag, tags]
  );

  const handleEditTag = useCallback(
    (oldTag: string, input: string) => {
      const newTag = input.trim();
      if (newTag && newTag !== oldTag && !tags.includes(newTag) && editTag) {
        editTag(oldTag, newTag);
      }
      setEditingTag(null);
    },
    [editTag, tags]
  );

  const handleEditBlur = useCallback(() => {
    const tag = editRef.current;
    if (!tag || !editingTag) return;
    const { textContent } = tag;
    handleEditTag(editingTag, textContent || "");
  }, [editingTag, handleEditTag]);

  const handleTagClick = useCallback(
    (tag: string, event: React.MouseEvent) => {
      if (readonly || !editTag || editingTag === tag) return;
      editClickPointRef.current = { x: event.clientX, y: event.clientY };
      setEditingTag(tag);
    },
    [readonly, editTag, editingTag]
  );

  // 在浏览器绘制前填充文本并放置光标，避免出现「空标签」的一帧闪烁
  useLayoutEffect(() => {
    const editElement = editRef.current;
    if (!editingTag || !editElement) return;
    editElement.textContent = editingTag;
    editElement.focus();
    const point = editClickPointRef.current;
    editClickPointRef.current = null;
    const clickedRange = point ? document.caretRangeFromPoint(point.x, point.y) : null;
    const range = document.createRange();
    if (clickedRange && editElement.contains(clickedRange.startContainer)) {
      range.setStart(clickedRange.startContainer, clickedRange.startOffset);
    } else {
      range.selectNodeContents(editElement);
    }
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editingTag]);

  useEffect(() => {
    if (!editingTag) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isHotkey("enter", e) || e.isComposing) return;
      const editElement = editRef.current;
      if (editElement) handleEditTag(editingTag, editElement.textContent || "");
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingTag, handleEditTag]);

  const renderAddTagBtn = () => {
    if (readonly) return undefined;
    return (
      <Popover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        placement="bottom-start"
        arrow={false}
        className="w-[280px]"
        trigger={
          <TauTag
            role="button"
            tabIndex={0}
            className={cn(
              TAG_SIZE_CLASS,
              "cursor-pointer gap-1 border-dashed outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
              pickerOpen
                ? "border-accent text-ink-1 border-solid"
                : "text-ink-3 hover:border-line-2 hover:bg-surface-hover hover:text-ink-1"
            )}
          >
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Plus aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
              添加标签
            </span>
          </TauTag>
        }
      >
        {pickerOpen && (
          <TagPickerPanel selected={tags} suggestions={suggestions} onPick={handlePick} />
        )}
      </Popover>
    );
  };

  return (
    <Tags
      className={cn("gap-2", divided && "border-line-2 mt-[34px] border-t pt-[18px]", className)}
      style={style}
      tags={tags}
      hoverAble={!readonly}
      closable={!readonly}
      onClose={!readonly ? removeTag : undefined}
      onClick={!readonly && editTag ? handleTagClick : undefined}
      tagClassName={TAG_SIZE_CLASS}
      lastChild={<>{renderAddTagBtn()}</>}
      noWrap
      editingTag={editingTag}
      editRef={editRef}
      onEditBlur={handleEditBlur}
      draggable={!readonly && !!onReorder}
      onReorder={onReorder}
    />
  );
};

export default AddTag;
