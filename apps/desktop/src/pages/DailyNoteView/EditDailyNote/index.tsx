import { useRafInterval, useUnmount } from "ahooks";

import Editor from "@/components/ContentEditor";

import useEditDailyNote from "@/hooks/useEditDailyNote";
import useDailyNoteStore from "@/stores/useDailyNoteStore";
import styles from "./index.module.less";
import { useShallow } from "zustand/react/shallow";

const DailyNoteContent = () => {
  const { activeDailyId, readonly } = useDailyNoteStore(
    useShallow(state => ({
      activeDailyId: state.activeDailyId,
      readonly: state.readonly,
    }))
  );

  const { editingDailyNote, onInit, onContentChange, saveDailyNote } =
    useEditDailyNote(activeDailyId);

  useRafInterval(() => {
    saveDailyNote?.();
  }, 1000);

  useUnmount(() => {
    saveDailyNote?.();
  });

  if (!editingDailyNote) return null;

  return (
    <div className={styles.editingDailyContainer}>
      <div className={styles.title}>{editingDailyNote.date}</div>
      <div className={styles.content}>
        <div className={styles.editor}>
          <Editor
            contentId={editingDailyNote.contentId}
            key={editingDailyNote.id}
            initValue={editingDailyNote.content}
            onInit={onInit}
            onChange={onContentChange}
            readonly={readonly}
          />
        </div>
      </div>
    </div>
  );
};

export default DailyNoteContent;
