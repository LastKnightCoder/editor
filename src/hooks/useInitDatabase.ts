import { useEffect } from "react";
import { App } from 'antd';
import { useMemoizedFn } from "ahooks";

import { connectDatabaseByName } from "@/commands";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useDocumentsStore from "@/stores/useDocumentsStore";
import useDailyNoteStore from "@/stores/useDailyNoteStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import useProjectsStore from "@/stores/useProjectsStore";
import usePdfsStore from "@/stores/usePdfsStore.ts";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import useSettingStore from "@/stores/useSettingStore.ts";

const useInitDatabase = () => {
  const { message } = App.useApp();

  const {
    inited,
    database
  } = useSettingStore(state => ({
    inited: state.inited,
    database: state.setting.database,
  }));

  const { active } = database;

  const {
    initArticles
  } = useArticleManagementStore(state => ({
    initArticles: state.init
  }));

  const {
    initCards,
  } = useCardsManagementStore((state) => ({
    initCards: state.init,
  }));

  const {
    initDocuments,
  } = useDocumentsStore(state => ({
    initDocuments: state.init,
  }));

  const {
    initDailyNotes,
  } = useDailyNoteStore(state => ({
    initDailyNotes: state.init
  }));

  const {
    initTimeRecords,
  } = useTimeRecordStore(state => ({
    initTimeRecords: state.init
  }));

  const {
    initProjects,
  } = useProjectsStore(state => ({
    initProjects: state.init
  }));

  const {
    initPdfs
  } = usePdfsStore(state => ({
    initPdfs: state.initPdfs
  }));

  const {
    initWhiteBoards,
  } = useWhiteBoardStore(state => ({
    initWhiteBoards: state.initWhiteBoards
  }));

  const initDatabase = useMemoizedFn(async () => {
    await Promise.all([
      initArticles(),
      initCards(),
      initDocuments(),
      initDailyNotes(),
      initTimeRecords(),
      initProjects(),
      initPdfs(),
      initWhiteBoards(),
    ]);
  });

  useEffect(() => {
    if (!inited || !active) return;
    message.open({
      type: 'loading',
      content: '正在初始化数据库...',
      key: 'initDatabase',
      duration: 0,
    })
    connectDatabaseByName(active).then(() => {
      initDatabase().then(() => {
        message.destroy('initDatabase');
      });
    });
  }, [inited, active, initDatabase, message]);

  return {
    initDatabase,
  }
}

export default useInitDatabase;