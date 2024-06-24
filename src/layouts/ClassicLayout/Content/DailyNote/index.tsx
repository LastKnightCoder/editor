import { Descendant, Editor as SlateEditor } from "slate";
import { useRafInterval, useUnmount } from "ahooks";
import useUploadImage from "@/hooks/useUploadImage.ts";

import Editor from "@/components/Editor";

import { DailyNote } from '@/types/daily_note';
import styles from './index.module.less';

interface IDailyNoteProps {
  editingDailyNote?: DailyNote;
  onInit?: (editor: SlateEditor, content: Descendant[]) => void;
  onContentChange?: (content: Descendant[], editor: SlateEditor) => void;
  readonly?: boolean;
  saveDailyNote?: () => void;
}

const DailyNoteContent = (props: IDailyNoteProps) => {
  const { editingDailyNote, onInit, onContentChange, readonly, saveDailyNote } = props;

  useRafInterval(() => {
    saveDailyNote?.();
  }, 1000);

  useUnmount(() => {
    saveDailyNote?.();
  });

  const uploadImage = useUploadImage();

  if (!editingDailyNote) return null;

  return (
    <div className={styles.editingDailyContainer}>
      <div className={styles.content}>
        <div className={styles.title}>
          {editingDailyNote.date}
        </div>
        <div className={styles.editor}>
          <Editor
            key={editingDailyNote.id}
            initValue={editingDailyNote.content}
            onInit={onInit}
            onChange={onContentChange}
            readonly={readonly}
            uploadImage={uploadImage}
          />
        </div>
      </div>
    </div>
  )
}

export default DailyNoteContent;
