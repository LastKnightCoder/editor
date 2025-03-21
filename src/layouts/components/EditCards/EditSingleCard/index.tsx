import { useEffect, useRef, useState } from "react";
import { Descendant, Editor as SlateEditor } from "slate";
import { useRafInterval, useUnmount } from "ahooks";

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
import { on, off } from "@/electron";
import useSettingStore from "@/stores/useSettingStore";

import styles from "./index.module.less";
import { getCardById } from "@/commands";

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
    onTagChange,
  } = props;

  const { currentDatabaseName } = useSettingStore((state) => ({
    currentDatabaseName: state.setting.database.active,
  }));

  const editorRef = useRef<EditorRef>(null);
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

  const uploadResource = useUploadResource();

  useRafInterval(() => {
    if (!readonly) {
      saveCard();
    }
  }, 1000);

  useUnmount(() => {
    if (!readonly) {
      saveCard();
    }
  });

  useEffect(() => {
    const handleCardWindowClosed = async (
      _event: any,
      data: { cardId: number; databaseName: string },
    ) => {
      if (
        data.cardId === editingCard.id &&
        data.databaseName === currentDatabaseName
      ) {
        const card = await getCardById(editingCard.id);
        onContentChange(card.content);
        onTagChange(card.tags);
        editorRef.current?.setEditorValue(card.content);
      }
    };

    on("card-window-closed", handleCardWindowClosed);

    return () => {
      off("card-window-closed", handleCardWindowClosed);
    };
  }, [currentDatabaseName, editingCard.id]);

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
              onChange={onContentChange}
              extensions={customExtensions}
              readonly={readonly}
              uploadResource={uploadResource}
            />
          </ErrorBoundary>
        </div>
        <div className={styles.addTag}>
          <AddTag
            tags={editingCard.tags}
            addTag={onAddTag}
            removeTag={onDeleteTag}
            readonly={readonly}
          />
        </div>
      </div>
    </EditCardContext.Provider>
  );
};

export default EditCard;
