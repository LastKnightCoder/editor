import React from "react";
import { App, Calendar } from "antd";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import { Dayjs } from "dayjs";
import Editor, { type IExtension } from "@editor/index.tsx";
import DailyNote from "@/pages/DailyNoteView/EditDailyNote";
import useDailyNoteStore from "@/stores/useDailyNoteStore.ts";
import { DeleteOutlined } from "@ant-design/icons";
import { SelectInfo } from "antd/es/calendar/generateCalendar";

import styles from "./index.module.less";
import For from "@/components/For";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
const extensions: IExtension[] = [];

const DailyNoteView = () => {
  const { modal } = App.useApp();
  const {
    dailyNotes,
    deleteDailyNote,
    onCreateDailyNote,
    activeDailyId,
    initData,
  } = useDailyNoteStore(
    useShallow((state) => ({
      dailyNotes: state.dailyNotes,
      deleteDailyNote: state.deleteDailyNote,
      onCreateDailyNote: state.onCreateDailyNote,
      activeDailyId: state.activeDailyId,
      initData: state.init,
    })),
  );

  // 在数据库连接或切换时加载每日笔记数据
  useDatabaseChangeEffect(() => {
    initData();
  });

  const isShowEdit = !!activeDailyId;

  const handleDeleteDailyNote = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    modal.confirm({
      title: "是否要删除此篇日记",
      onOk: async () => {
        await deleteDailyNote(id);
      },
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
  };

  const onSelect = async (value: Dayjs, { source }: SelectInfo) => {
    if (source === "date") {
      const date = value.format("YYYY-MM-DD");
      const dailyNote = dailyNotes.find((item) => item.date === date);
      if (!dailyNote) {
        modal.confirm({
          title: "是否创建日记",
          onOk: async () => {
            const createdDailyNote = await onCreateDailyNote(date);
            useDailyNoteStore.setState({
              activeDailyId: createdDailyNote.id,
              readonly: false,
            });
          },
        });
      }
    }
  };

  const cellRender = (value: Dayjs) => {
    const notes = dailyNotes.filter(
      (item) => item.date === value.format("YYYY-MM-DD"),
    );
    if (notes.length > 0) {
      return (
        <For
          data={notes}
          renderItem={(dailyNote) => (
            <div
              key={dailyNote.contentId}
              className={styles.cellDailyNote}
              onClick={() => {
                useDailyNoteStore.setState({
                  activeDailyId:
                    dailyNote.id === activeDailyId ? undefined : dailyNote.id,
                  readonly: false,
                });
              }}
            >
              <Editor
                initValue={dailyNote.content.slice(0, 1)}
                extensions={extensions}
                readonly
              />
              <div
                className={styles.delete}
                onClick={(e) => {
                  handleDeleteDailyNote(e, dailyNote.id);
                }}
              >
                <DeleteOutlined />
              </div>
            </div>
          )}
        />
      );
    }
  };

  return (
    <div className={styles.container}>
      <div
        className={classnames(styles.viewContainer, {
          [styles.showEdit]: isShowEdit,
        })}
      >
        <div className={styles.calendarContainer}>
          <Calendar cellRender={cellRender} onSelect={onSelect} />
        </div>
        <div className={styles.edit}>
          <DailyNote />
        </div>
      </div>
    </div>
  );
};

export default DailyNoteView;
