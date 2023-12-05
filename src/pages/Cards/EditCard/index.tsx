import {createContext, useEffect, useRef, useState} from "react";
import { Descendant } from "slate";

import Editor, { EditorRef } from '@/components/Editor';
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";

import { cardLinkExtension } from "@/editor-extensions";

import useUploadImage from "@/hooks/useUploadImage.ts";

import { ICard } from "@/types";

import { formatDate } from "@/utils/time.ts";

import styles from './index.module.less';
import {useWhyDidYouUpdate} from "ahooks";

const customExtensions = [cardLinkExtension];

interface IEditCardProps {
  readonly: boolean;
  editingCard: ICard;
  onContentChange: (value: Descendant[]) => void;
  onAddTag: (tag: string) => void;
  onDeleteTag: (tag: string) => void;
  saveCard: () => void;
}

export const EditCardContext = createContext<{ cardId: number } | null>(null);

const EditCard = (props: IEditCardProps) => {
  const {
    readonly = false,
    editingCard,
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

  useEffect(() => {
    return () => {
      saveCard();
    }
  }, [saveCard]);

  useWhyDidYouUpdate('EditCard', props);

  return (
    <EditCardContext.Provider value={{
      cardId: editingCard.id,
    }}>
      <div className={styles.editCardContainer}>
        <div className={styles.time}>
          <div>创建于 {formatDate(editingCard.create_time, true)}</div>
          <div>最后修改于 {formatDate(editingCard.update_time, true)}</div>
        </div>
        <div className={styles.editor}>
          <ErrorBoundary>
            <Editor
              key={editingCard.id}
              ref={editorRef}
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