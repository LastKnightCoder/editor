import { useMemoizedFn } from "ahooks";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useDocumentsStore from "@/stores/useDocumentsStore";
import useDailyNoteStore from "@/stores/useDailyNoteStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import useProjectsStore from "@/stores/useProjectsStore";
import usePdfsStore from "@/stores/usePdfsStore.ts";

const useInitDatabase = () => {
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

  const initDatabase = useMemoizedFn(async () => {
    await Promise.all([
      initArticles(),
      initCards(),
      initDocuments(),
      initDailyNotes(),
      initTimeRecords(),
      initProjects(),
      initPdfs(),
    ]);
  });

  return {
    initDatabase,
  }
}

export default useInitDatabase;