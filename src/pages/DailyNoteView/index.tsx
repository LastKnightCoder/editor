import React, { useEffect } from "react";
import { Calendar, Modal, Breadcrumb } from "antd";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import { Dayjs } from "dayjs";
import Editor from "@editor/index.tsx";
import DailyNote from "@/pages/DailyNoteView/EditDailyNote";
import useDailyNoteStore from "@/stores/useDailyNoteStore.ts";
import { DeleteOutlined } from "@ant-design/icons";
import { SelectInfo } from "antd/es/calendar/generateCalendar";
import { useNavigate } from "react-router-dom";
import Titlebar from "@/components/Titlebar";

import styles from "./index.module.less";
import For from "@/components/For";
import { dailySummaryExtension } from "@/editor-extensions";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
const extensions = [dailySummaryExtension];

const DailyNoteView = () => {
  const navigate = useNavigate();
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

  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  useEffect(() => {
    if (isConnected && active) {
      initData();
    }
  }, [isConnected, active, initData]);

  const isShowEdit = !!activeDailyId;

  const handleDeleteDailyNote = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    Modal.confirm({
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
        Modal.confirm({
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

  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "日记", path: "/dailies" },
  ];

  return (
    <div className={styles.container}>
      <Titlebar className={styles.titlebar}>
        <Breadcrumb
          className={styles.breadcrumb}
          items={breadcrumbItems.map((item) => ({
            title: (
              <span
                className={styles.breadcrumbItem}
                onClick={() => navigate(item.path)}
              >
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
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
