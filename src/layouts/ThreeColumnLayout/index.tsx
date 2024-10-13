import { memo, useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import isHotkey from "is-hotkey";
import classnames from "classnames";

import Sidebar from './Sidebar';
import Titlebar from "./Titlebar";
import CardList from './List/CardList';
import CardContent from './Content/Card';
import CardTitlebar from "./Titlebar/Card";
import SettingModal from "../components/SettingModal";
import NavigatePage from "./NavigatePage";
import EditRecordModal from "@/components/EditRecordModal";
import ResizeableAndHideableSidebar from '@/components/ResizableAndHideableSidebar';

import { initAllDocumentItemParents } from "@/commands";

import { ITimeRecord } from "@/types";

import useExitFocusMode from "./hooks/useExitFocusMode";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";

import loadable from "@loadable/component";

import styles from './index.module.less';

const ArticleList = loadable(() => import('./List/ArticleList'));
const DocumentList = loadable(() => import('./List/DocumentList'));
const DailyList = loadable(() => import('./List/DailyList'));
const TimeRecordList = loadable(() => import('./List/TimeRecord'));
const ProjectList = loadable(() => import('./List/ProjectList'));
const PdfList = loadable(() => import('./List/PdfList'));
const WhiteBoardList = loadable(() => import('./List/WhiteBoardList'));

const ArticleContent = loadable(() => import('./Content/Article'));
const DocumentContent = loadable(() => import('./Content/Document'));
const DailyNoteContent = loadable(() => import('./Content/DailyNote'));
const TimeRecordContent = loadable(() => import('./Content/TimeRecord'));
const ProjectContent = loadable(() => import('./Content/Project'));
const PdfContent = loadable(() => import('./Content/Pdf'));
const WhiteBoardContent = loadable(() => import('./Content/WhiteBoard'));

const ArticleTitlebar = loadable(() => import('./Titlebar/Article'));
const DocumentTitlebar = loadable(() => import('./Titlebar/Document'));
const DailyNoteTitlebar = loadable(() => import('./Titlebar/DailyNote'));
const TimeRecordTitlebar = loadable(() => import('./Titlebar/TimeRecord'));
const ProjectTitlebar = loadable(() => import('./Titlebar/Project'));
const PdfTitlebar = loadable(() => import('./Titlebar/Pdf'));
const WhiteBoard = loadable(() => import('./Titlebar/WhiteBoard'));
const ClassicLayout = memo(() => {
  const {
    focusMode,
    listWidth,
    listOpen,
    sidebarOpen,
    sidebarWidth,
  } = useGlobalStateStore(state => ({
    focusMode: state.focusMode,
    listOpen: state.listOpen,
    listWidth: state.listWidth,
    sidebarOpen: state.sidebarOpen,
    sidebarWidth: state.sidebarWidth,
  }));

  useExitFocusMode();

  const contentAreaWidth = useMemo(() => {
    const finalSidebarWidth = (focusMode || !sidebarOpen) ? 0 : sidebarWidth;
    const finalListWidth =  (focusMode ||  !listOpen) ? 0 : listWidth;
    return `calc(100vw - ${finalSidebarWidth}px - ${finalListWidth}px)`
  }, [focusMode, listOpen, listWidth, sidebarOpen, sidebarWidth]);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // mod + p
      if (isHotkey('mod+p', event)) {
        event.preventDefault();
        event.stopPropagation();
        await initAllDocumentItemParents();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  const [editAction, setEditAction] = useState<'create' | 'edit' | null>(null);
  const [editRecordModalOpen, setEditRecordModalOpen] = useState<boolean>(false);
  const [editingTimeRecord, setEditingTimeRecord] = useState<ITimeRecord | null>(null);

  const {
    createTimeRecord,
    updateTimeRecord,
  } = useTimeRecordStore((state) => ({
    createTimeRecord: state.createTimeRecord,
    updateTimeRecord: state.updateTimeRecord,
  }));

  const onEditTimeRecordFinish = useMemoizedFn(async (timeRecord: ITimeRecord) => {
    if (!editAction) return;
    if (editAction === 'create') {
      await createTimeRecord(timeRecord);
    } else {
      await updateTimeRecord(timeRecord);
    }
    setEditRecordModalOpen(false);
    setEditAction(null);
    setEditingTimeRecord(null);
  });

  const onEditTimeRecordCancel = useMemoizedFn(() => {
    setEditRecordModalOpen(false);
    setEditAction(null);
    setEditingTimeRecord(null);
  });

  const onEditTimeRecord = useMemoizedFn((timeRecord: ITimeRecord) => {
    setEditingTimeRecord(timeRecord);
    setEditAction('edit');
    setEditRecordModalOpen(true);
  });

  const onCreateNewTimeRecord = useMemoizedFn((date) => {
    setEditingTimeRecord({
      id: -1,
      content: [{
        type: 'paragraph',
        children: [{ text: '', type: 'formatted' }],
      }],
      cost: 0,
      date,
      eventType: '',
      timeType: ''
    });
    setEditAction('create');
    setEditRecordModalOpen(true);
  })
  
  useEffect(() => {
    // 如果当前路是 /，重定向到 /cards
    if (location.pathname === '/') {
      navigate('/cards');
    }
  }, [location, navigate]);

  return (
    <div className={classnames(styles.container, { [styles.focusMode]: focusMode })}>
      <ResizeableAndHideableSidebar
        width={sidebarWidth}
        open={sidebarOpen && !focusMode}
        onWidthChange={(width) => {
          useGlobalStateStore.setState({
            sidebarWidth: width,
          });
          localStorage.setItem('sidebarWidth', width.toString());
        }}
        className={styles.sidebar}
      >
        <Sidebar />
      </ResizeableAndHideableSidebar>
      <ResizeableAndHideableSidebar
        width={listWidth}
        open={listOpen && !focusMode}
        onWidthChange={(width) => {
          useGlobalStateStore.setState({
            listWidth: width,
          });
          localStorage.setItem('listWidth', width.toString());
        }}
        className={styles.list}
      >
        <Routes>
          <Route path="/whiteBoard/" element={<WhiteBoardList />}/>
          <Route path="/cards/" element={<CardList />}/>
          <Route path="/articles/" element={<ArticleList />}/>
          <Route path="/documents/" element={<DocumentList />}/>
          <Route path="/daily/" element={<DailyList />}/>  
          <Route path="/timeRecord/" element={<TimeRecordList onClickEdit={onEditTimeRecord} />}/>
          <Route path={"/projects/"} element={<ProjectList/>}/>
          <Route path={"/pdf"} element={<PdfList />}/>
        </Routes>
      </ResizeableAndHideableSidebar>
      <div
        className={styles.contentArea}
        style={{
          width: contentAreaWidth,
          flexBasis: contentAreaWidth,
        }}
      >
        <div className={styles.titleBar}>
          <Routes>
            <Route path="/" element={<Titlebar />}>
              <Route path="whiteBoard/" element={<WhiteBoard />} />
              <Route path="cards/" element={<CardTitlebar />} />
              <Route path="articles/" element={<ArticleTitlebar />} />
              <Route path="documents/" element={<DocumentTitlebar />} />
              <Route path={"daily/"} element={<DailyNoteTitlebar />} />
              <Route path="timeRecord/" element={<TimeRecordTitlebar onCreateNewTimeRecord={onCreateNewTimeRecord} />}/>
              <Route path={"projects/"} element={<ProjectTitlebar />}/>
              <Route path={"pdf"} element={<PdfTitlebar />} />
            </Route>
          </Routes>
        </div>
        <div className={styles.content}>
          <Routes>
            <Route path="/whiteBoard/" element={<WhiteBoardContent />}/>
            <Route path="/cards/" element={<CardContent />} />
            <Route path="/articles/" element={<ArticleContent />}/>
            <Route path="/documents/" element={<DocumentContent />}/>
            <Route path="/daily/" element={<DailyNoteContent />} />
            <Route path="/timeRecord/" element={<TimeRecordContent />} />
            <Route path={'/projects/'} element={<ProjectContent />}/>
            <Route path={'/pdf'} element={<PdfContent />}/>
          </Routes>
        </div>
      </div>
      <EditRecordModal
        key={editingTimeRecord?.id}
        title={'编辑记录'}
        open={editRecordModalOpen}
        timeRecord={editingTimeRecord}
        onOk={onEditTimeRecordFinish}
        onCancel={onEditTimeRecordCancel}
      />
      <SettingModal />
      <NavigatePage />
    </div>
  )
});

export default ClassicLayout;