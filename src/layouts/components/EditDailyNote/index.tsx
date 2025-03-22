import { useRafInterval, useUnmount } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource.ts";

import Editor from "@/components/Editor";

import useEditDailyNote from "@/hooks/useEditDailyNote";
import useDailyNoteStore from "@/stores/useDailyNoteStore";
import { dailySummaryExtension } from "@/editor-extensions";
import styles from "./index.module.less";
import { useShallow } from "zustand/react/shallow";
const extensions = [dailySummaryExtension];

const DailyNoteContent = () => {
  const { activeDailyId, readonly } = useDailyNoteStore(
    useShallow((state) => ({
      activeDailyId: state.activeDailyId,
      readonly: state.readonly,
    })),
  );

  const { editingDailyNote, onInit, onContentChange, saveDailyNote } =
    useEditDailyNote(activeDailyId);

  useRafInterval(() => {
    saveDailyNote?.();
  }, 1000);

  useUnmount(() => {
    saveDailyNote?.();
  });

  const uploadResource = useUploadResource();

  if (!editingDailyNote) return null;

  return (
    <div className={styles.editingDailyContainer}>
      <div className={styles.title}>{editingDailyNote.date}</div>
      <div className={styles.content}>
        <div className={styles.editor}>
          <Editor
            key={editingDailyNote.id}
            initValue={editingDailyNote.content}
            onInit={onInit}
            onChange={onContentChange}
            readonly={readonly}
            uploadResource={uploadResource}
            extensions={extensions}
          />
        </div>
      </div>
    </div>
  );
};

export default DailyNoteContent;
