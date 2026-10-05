import React, { useEffect, useState, useRef, useCallback } from "react";
import isHotKey from "is-hotkey";
import { Plus } from "lucide-react";

import { Tag as TauTag, cn } from "@tau/ui";
import Tags from "@/components/Tags";

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
  } = props;
  const [addTagVisible, setAddTagVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);

  const handleAddTag = useCallback(
    (input: string) => {
      const tag = input.trim();
      if (tag && !tags.includes(tag)) {
        addTag(tag);
      }
      setAddTagVisible(false);
    },
    [addTag, tags]
  );

  const handleBlur = useCallback(() => {
    const tag = ref.current;
    if (!tag) return;
    const { textContent } = tag;
    handleAddTag(textContent || "");
  }, [handleAddTag]);

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
      const { clientX, clientY } = event;
      setEditingTag(tag);

      setTimeout(() => {
        if (editRef.current) {
          editRef.current.textContent = tag;
          editRef.current.focus();
          const clickedRange = document.caretRangeFromPoint(clientX, clientY);
          const range = document.createRange();
          if (clickedRange && editRef.current.contains(clickedRange.startContainer)) {
            range.setStart(clickedRange.startContainer, clickedRange.startOffset);
          } else {
            range.selectNodeContents(editRef.current);
          }
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      });
    },
    [readonly, editTag, editingTag]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotKey("enter", e) && !e.isComposing) {
        if (addTagVisible) {
          const tag = ref.current;
          if (tag) {
            const { textContent } = tag;
            handleAddTag(textContent || "");
          }
        } else if (editingTag) {
          // 在编辑模式下，从 editRef 获取内容
          const editElement = editRef.current;
          if (editElement) {
            const { textContent } = editElement;
            handleEditTag(editingTag, textContent || "");
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [addTagVisible, editingTag, handleAddTag, handleEditTag]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (addTagVisible) return;
      e.stopPropagation();
      setAddTagVisible(true);
      setTimeout(() => {
        ref.current?.focus();
      });
    },
    [addTagVisible]
  );

  const renderAddTagBtn = () => {
    if (readonly) return undefined;
    return (
      <TauTag
        onClick={handleClick}
        className="hover:bg-surface-hover hover:text-ink-1 cursor-pointer"
      >
        <span className="flex items-center gap-0.5 whitespace-nowrap">
          <Plus aria-hidden className="size-3 shrink-0" strokeWidth={2} />
          {addTagVisible ? (
            <div
              ref={ref}
              contentEditable={addTagVisible}
              suppressContentEditableWarning
              onBlur={handleBlur}
              style={{
                outline: "none",
                minWidth: "2ch",
                display: "inline-block",
              }}
            />
          ) : (
            "添加标签"
          )}
        </span>
      </TauTag>
    );
  };

  return (
    <Tags
      className={cn(divided && "border-line-2 mt-[34px] border-t pt-[18px]", className)}
      style={style}
      tags={tags}
      hoverAble={!readonly}
      closable={!readonly}
      onClose={!readonly ? removeTag : undefined}
      onClick={!readonly && editTag ? handleTagClick : undefined}
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
