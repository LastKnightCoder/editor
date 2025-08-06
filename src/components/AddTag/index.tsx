import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import isHotKey from "is-hotkey";

import { PlusOutlined } from "@ant-design/icons";
import Tags from "@/components/Tags";
import Tag from "@/components/Tags/Tag";

interface AddTagProps {
  tags: string[];
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  editTag?: (oldTag: string, newTag: string) => void;
  readonly?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const AddTag = (props: AddTagProps) => {
  const {
    tags,
    addTag,
    removeTag,
    editTag,
    readonly = false,
    className,
    style,
  } = props;
  const [addTagVisible, setAddTagVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);

  const handleAddTag = useCallback(
    (tag: string) => {
      if (tag) {
        addTag(tag);
      }
      setAddTagVisible(false);
    },
    [addTag],
  );

  const handleBlur = useCallback(() => {
    const tag = ref.current;
    if (!tag) return;
    const { textContent } = tag;
    handleAddTag(textContent || "");
  }, [handleAddTag]);

  const handleEditTag = useCallback(
    (oldTag: string, newTag: string) => {
      if (newTag && newTag !== oldTag && editTag) {
        editTag(oldTag, newTag);
      }
      setEditingTag(null);
    },
    [editTag],
  );

  const handleEditBlur = useCallback(() => {
    const tag = editRef.current;
    if (!tag || !editingTag) return;
    const { textContent } = tag;
    handleEditTag(editingTag, textContent || "");
  }, [editingTag, handleEditTag]);

  const handleTagClick = useCallback(
    (tag: string) => {
      if (readonly || !editTag) return;
      setEditingTag(tag);

      setTimeout(() => {
        if (editRef.current) {
          editRef.current.textContent = tag;
          editRef.current.focus();
          // 选中所有文本
          const range = document.createRange();
          range.selectNodeContents(editRef.current);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      });
    },
    [readonly, editTag],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotKey("enter", e)) {
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
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (addTagVisible) return;
      e.stopPropagation();
      setAddTagVisible(true);
      setTimeout(() => {
        ref.current?.focus();
      });
    },
    [addTagVisible],
  );

  const tag = useMemo(() => {
    return addTagVisible ? (
      <div
        style={{ paddingLeft: 4 }}
        ref={ref}
        contentEditable={addTagVisible}
        suppressContentEditableWarning
        onBlur={handleBlur}
      />
    ) : (
      "添加标签"
    );
  }, [addTagVisible, handleBlur]);

  const renderAddTagBtn = () => {
    if (readonly) return undefined;
    return (
      <Tag
        onClick={handleClick}
        showIcon
        hoverAble={!readonly}
        icon={<PlusOutlined />}
        tag={tag}
      />
    );
  };

  return (
    <Tags
      className={className}
      style={style}
      tags={tags}
      hoverAble={!readonly}
      closable={!readonly}
      onClose={!readonly ? removeTag : undefined}
      onClick={!readonly && editTag ? handleTagClick : undefined}
      lastChild={renderAddTagBtn()}
      noWrap
      showIcon
      editingTag={editingTag}
      editRef={editRef}
      onEditBlur={handleEditBlur}
    />
  );
};

export default AddTag;
