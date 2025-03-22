import styles from "./index.module.less";
import Editor, { EditorRef } from "@editor/index.tsx";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import AddTag from "@/components/AddTag";
import { memo, useEffect, useRef, useState } from "react";
import classnames from "classnames";
import { Button } from "antd";
import PortalToBody from "@/components/PortalToBody";
import useTheme from "@/hooks/useTheme";

const DEFAULT_CONTENT = [
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  },
] as Descendant[];

interface CreateCardProps {
  className?: string;
  onSave: (content: Descendant[], tags: string[]) => Promise<void>;
  onCancel: () => void;
  visible: boolean;
}

const CreateCard = memo((props: CreateCardProps) => {
  const { className, onSave, onCancel, visible } = props;
  const editorRef = useRef<EditorRef>(null);
  const { isDark } = useTheme();

  const [content, setContent] = useLocalStorageState<Descendant[]>(
    "card-edit-content",
    {
      defaultValue: DEFAULT_CONTENT,
    },
  );
  const [tags, setTags] = useLocalStorageState<string[]>("card-edit-tags", {
    defaultValue: [],
  });

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        editorRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  const onAddTag = (tag: string) => {
    setTags([...new Set([...(tags || []), tag])]);
  };

  const onRemoveTag = (tag: string) => {
    setTags((tags || []).filter((t) => t !== tag));
  };

  const onSaveCard = useMemoizedFn(
    async (content: Descendant[], tags: string[]) => {
      await onSave(content, tags);
      setContent(DEFAULT_CONTENT);
      setTags([]);
      editorRef.current?.setEditorValue(DEFAULT_CONTENT);
    },
  );

  const onCancelSaveCard = () => {
    setContent(DEFAULT_CONTENT);
    setTags([]);
    editorRef.current?.setEditorValue(DEFAULT_CONTENT);
    onCancel();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancelSaveCard();
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <PortalToBody>
      <div className={styles.modalOverlay} onClick={handleOverlayClick}>
        <div
          className={classnames(
            styles.modalContainer,
            isDark ? styles.darkTheme : styles.lightTheme,
          )}
        >
          <div className={classnames(styles.container, className)}>
            <div className={styles.editorWrapper}>
              <Editor
                ref={editorRef}
                initValue={content || DEFAULT_CONTENT}
                readonly={false}
                onChange={setContent}
              />
            </div>
            <div className={styles.save}>
              <AddTag
                tags={tags || []}
                addTag={onAddTag}
                removeTag={onRemoveTag}
              />
              <div className={styles.buttons}>
                <Button onClick={onCancelSaveCard}>取消</Button>
                <Button
                  onClick={onSaveCard.bind(
                    null,
                    content || DEFAULT_CONTENT,
                    tags || [],
                  )}
                >
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalToBody>
  );
});

export default CreateCard;
