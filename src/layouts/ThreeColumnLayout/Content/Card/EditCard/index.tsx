import { useRef, useState } from "react";
import { Descendant, Editor as SlateEditor } from "slate";
import { useRafInterval, useUnmount } from "ahooks";

import Editor, { EditorRef } from '@/components/Editor';
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadImage from "@/hooks/useUploadImage.ts";
import { cardLinkExtension, fileAttachmentExtension } from "@/editor-extensions";
import { ICard } from "@/types";
import { formatDate } from "@/utils/time.ts";
import { EditCardContext } from "@/context";

import styles from './index.module.less';

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

interface IEditCardProps {
  readonly: boolean;
  editingCard: ICard;
  onInit?: (editor: SlateEditor, content: Descendant[]) => void;
  onContentChange: (value: Descendant[]) => void;
  onAddTag: (tag: string) => void;
  onDeleteTag: (tag: string) => void;
  saveCard: () => void;
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

  const editorRef = useRef<EditorRef>(null);
  const [initValue] = useState(() => {
    if (editingCard.content.length === 0) {
      return [{
        type: 'paragraph',
        children: [{ type: 'formatted', text: '' }],
      }] as Descendant[];
    }
    return editingCard.content;
  });

  const uploadImage = useUploadImage();

  useRafInterval(() => {
    if (!readonly) {
      saveCard();
    }
  }, 1000)

  useUnmount(() => {
    if (!readonly) {
      saveCard();
    }
  });

  return (
    <EditCardContext.Provider value={{
      cardId: editingCard.id,
    }}>
      <div className={styles.editCardContainer}>
        <div className={styles.time}>
          <div><span>创建于 {formatDate(editingCard.create_time, true)}</span></div>
          <div><span>最后修改于 {formatDate(editingCard.update_time, true)}</span></div>
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
              uploadImage={uploadImage}
            />
          </ErrorBoundary>
        </div>
        <div className={styles.addTag}>
          <AddTag tags={editingCard.tags} addTag={onAddTag} removeTag={onDeleteTag} readonly={readonly} />
        </div>
      </div>
    </EditCardContext.Provider>
  )
}

export default EditCard;
