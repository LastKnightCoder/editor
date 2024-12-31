import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import { message } from "antd";
import useDailyNoteStore from "@/stores/useDailyNoteStore.ts";

export const insertDailySummary = (editor: Editor) => {
  const activeDailyId = useDailyNoteStore.getState().activeDailyId;
  const activeDailyNote = useDailyNoteStore.getState().dailyNotes.find(item => item.id === activeDailyId);
  if (!activeDailyNote) {
    message.error('当前不在日记环境中');
    return;
  }

  const date = activeDailyNote.date;

  return setOrInsertNode(editor, {
    // @ts-ignore
    type: 'daily-summary',
    date,
    children: [{
      type: 'formatted',
      text: ''
    }]
  });
}
