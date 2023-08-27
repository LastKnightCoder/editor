import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import isHotKey from "is-hotkey";

import { PlusOutlined } from "@ant-design/icons";
import Tags from "@/components/Tags";
import Tag from "@/components/Tags/Tag";

interface AddTagProps {
  tags: string[];
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  readonly?: boolean;
}

const AddTag = (props: AddTagProps) => {
  const { tags, addTag, removeTag, readonly = false } = props;
  const [addTagVisible, setAddTagVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleAddTag = useCallback((tag: string) => {
    if (tag) {
      addTag(tag);
    }
    setAddTagVisible(false);
  }, [addTag]);

  const handleBlur = useCallback(() => {
    const tag = ref.current;
    if (!tag) return;
    const { textContent } = tag;
    handleAddTag(textContent || '');
  }, [handleAddTag]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotKey('enter', e) && addTagVisible) {
        const tag = e.target as HTMLDivElement;
        const { textContent } = tag;
        handleAddTag(textContent || '');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [addTagVisible, handleAddTag]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (addTagVisible) return;
    e.stopPropagation();
    setAddTagVisible(true);
    setTimeout(() => {
      ref.current?.focus();
    });
  }, [addTagVisible]);

  const tag = useMemo(() => {
    return addTagVisible ?
      <div
        style={{ paddingLeft: 2 }}
        ref={ref}
        contentEditable={addTagVisible}
        suppressContentEditableWarning
        onBlur={handleBlur}
      />
      : '添加标签';
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
    )
  }

  return (
    <Tags
      tags={tags}
      hoverAble={!readonly}
      closable={!readonly}
      onClose={!readonly ? removeTag : undefined}
      lastChild={renderAddTagBtn()}
      noWrap
      showIcon
    />
  )
}

export default AddTag;