import { useEffect, useRef, useState } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { App } from 'antd';
import { Descendant, Editor } from "slate";

import useDailyNoteStore from "@/stores/useDailyNoteStore";

import { getContentLength } from "@/utils";
import { DailyNote } from "@/types/daily_note";


const useEditDailyNote = (id?: number) => {
  const [loading, setLoading] = useState(false);
  const [editingDailyNote, setEditingDailyNote] = useState<DailyNote>();
  const [wordsCount, setWordsCount] = useState(0);

  const prevDailyNote = useRef<DailyNote | null>(null);
  const contentChanged = useRef(false);

  const { modal } = App.useApp();

  const {
    dailyNotes,
    createDailyNote,
    updateDailyNote,
    deleteDailyNote,
  } = useDailyNoteStore((state) => ({
    dailyNotes: state.dailyNotes,
    createDailyNote: state.onCreateDailyNote,
    updateDailyNote: state.onUpdateDailyNote,
    deleteDailyNote: state.deleteDailyNote,
  }));

  useAsyncEffect(async () => {
    if (!id) {
      await quitEditDailyNote();
      return;
    }
    setLoading(true);
    const dailyNote = dailyNotes.find((item) => item.id === id);
    if (dailyNote) {
      prevDailyNote.current = dailyNote;
      setEditingDailyNote(dailyNote);
    } else {
      prevDailyNote.current = null;
      setEditingDailyNote(undefined);
    }
    contentChanged.current = false;
    setLoading(false);
  }, [id]);

  useEffect(() => {
    contentChanged.current = JSON.stringify(editingDailyNote?.content) !== JSON.stringify(prevDailyNote.current?.content);
  }, [editingDailyNote]);

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor) return;
    const wordsCount = getContentLength(content);
    setWordsCount(wordsCount);
  });

  const onContentChange = useMemoizedFn((content: Descendant[], editor: Editor) => {
    if (!editingDailyNote) return;
    const newEditingDailyNote = produce(editingDailyNote, (draft) => {
      draft.content = content;
    });
    setEditingDailyNote(newEditingDailyNote);
    if (!editor) return;
    const wordsCount = getContentLength(content);
    setWordsCount(wordsCount);
  })

  const createNewDailyNote = useMemoizedFn(async (date: string) => {
    const createdDailyNote = await createDailyNote(date);
    useDailyNoteStore.setState({
      activeDailyId: createdDailyNote.id,
    });
  });

  const saveDailyNote = useMemoizedFn(async () => {
    if (!editingDailyNote || !contentChanged.current) return;
    await updateDailyNote(editingDailyNote);
    prevDailyNote.current = editingDailyNote;
    contentChanged.current = false;
  });

  const quitEditDailyNote = useMemoizedFn(async () => {
    if (!editingDailyNote) return;
    await saveDailyNote();
    useDailyNoteStore.setState({
      activeDailyId: undefined,
    });
  });

  const handleDeleteDailyNote = useMemoizedFn(async () => {
    if (!editingDailyNote) return;
    modal.confirm({
      title: '删除日记',
      content: '确定要删除这篇日记吗？',
      onOk: async () => {
        await deleteDailyNote(editingDailyNote.id);
        useDailyNoteStore.setState({
          activeDailyId: undefined,
        });
        setEditingDailyNote(undefined);
        prevDailyNote.current = null;
        contentChanged.current = false;
      },
      okText: '确定',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      }
    })
  });

  return {
    loading,
    wordsCount,
    editingDailyNote,
    createNewDailyNote,
    saveDailyNote,
    onInit,
    onContentChange,
    quitEditDailyNote,
    handleDeleteDailyNote,
  }
}

export default useEditDailyNote;
