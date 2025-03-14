import { useRef } from "react";
import { Button } from "antd";
import { useMemoizedFn } from "ahooks";
import Editor from "@/components/Editor";
import { Descendant } from "slate";

import { Note } from "@/types";

import styles from "./index.module.less";

interface NoteEditViewProps {
  note: Note;
  onFinish: (note: Note) => void;
  onCancel: () => void;
}

const NoteEditView = (props: NoteEditViewProps) => {
  const { note, onCancel, onFinish } = props;

  const content = useRef<Descendant[]>(note.note);

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    content.current = value;
  });

  return (
    <div className={styles.noteContainer}>
      <Editor
        className={styles.editor}
        initValue={content.current}
        readonly={false}
        onChange={onContentChange}
      />
      <div className={styles.buttons}>
        <Button onClick={onCancel}>取消</Button>
        <Button
          onClick={() => onFinish({ id: note.id, note: content.current })}
        >
          保存
        </Button>
      </div>
    </div>
  );
};

export default NoteEditView;
