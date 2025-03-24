import { useEffect, useRef, useState } from "react";
import { Descendant, Editor as SlateEditor } from "slate";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import { ICard } from "@/types";
import { formatDate } from "@/utils/time.ts";
import { EditCardContext } from "@/context";
import { defaultCardEventBus } from "@/utils";

import styles from "./index.module.less";
import { useWindowFocus } from "@/hooks/useWindowFocus";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

interface IEditCardProps {
  readonly: boolean;
  editingCard: ICard;
  onInit?: (editor: SlateEditor, content: Descendant[]) => void;
  onContentChange: (value: Descendant[]) => void;
  onAddTag: (tag: string) => void;
  onDeleteTag: (tag: string) => void;
  saveCard: () => void;
  onTagChange: (tags: string[]) => void;
}

const EditCard = (props: IEditCardProps) => {
  const {
    readonly = false,
    editingCard,
    onInit,
    onContentChange,
    onAddTag,
    onDeleteTag,
    saveCard,
  } = props;

  const isWindowFocused = useWindowFocus();

  const editorRef = useRef<EditorRef>(null);
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const [initValue] = useState(() => {
    if (editingCard.content.length === 0) {
      return [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "" }],
        },
      ] as Descendant[];
    }
    return editingCard.content;
  });

  const onChange = useMemoizedFn((value: Descendant[]) => {
    if (!editingCard || !editorRef.current?.isFocus() || !isWindowFocused)
      return;
    onContentChange(value);
    cardEventBus.publishCardEvent("card:updated", {
      ...editingCard,
      content: value,
    });
  });

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    onAddTag(tag);
    cardEventBus.publishCardEvent("card:updated", {
      ...editingCard,
      tags: [...editingCard.tags, tag],
    });
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    onDeleteTag(tag);
    cardEventBus.publishCardEvent("card:updated", {
      ...editingCard,
      tags: editingCard.tags.filter((t) => t !== tag),
    });
  });
  const uploadResource = useUploadResource();

  useRafInterval(() => {
    if (!readonly && editorRef.current?.isFocus() && isWindowFocused) {
      saveCard();
    }
  }, 3000);

  useUnmount(() => {
    if (!readonly) {
      saveCard();
    }
  });

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      editingCard.id,
      (data) => {
        onContentChange(data.card.content);
        editorRef.current?.setEditorValue(data.card.content);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [editingCard.id]);

  return (
    <EditCardContext.Provider
      value={{
        cardId: editingCard.id,
      }}
    >
      <div className={styles.editCardContainer}>
        <div className={styles.time}>
          <div>
            <span>创建于 {formatDate(editingCard.create_time, true)}</span>
          </div>
          <div>
            <span>最后修改于 {formatDate(editingCard.update_time, true)}</span>
          </div>
        </div>
        <div className={styles.editor}>
          <ErrorBoundary>
            <Editor
              key={editingCard.id}
              ref={editorRef}
              onInit={onInit}
              initValue={initValue}
              onChange={onChange}
              extensions={customExtensions}
              readonly={readonly}
              uploadResource={uploadResource}
            />
          </ErrorBoundary>
        </div>
        <div className={styles.addTag}>
          <AddTag
            tags={editingCard.tags}
            addTag={handleAddTag}
            removeTag={handleDeleteTag}
            readonly={readonly}
          />
        </div>
      </div>
    </EditCardContext.Provider>
  );
};

export default EditCard;
