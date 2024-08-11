import { memo, useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import dayjs from "dayjs";
import isHotkey from "is-hotkey";

import Sidebar from './Sidebar';
import Titlebar from "./Titlebar";
import CardList from './List/CardList';
import CardContent from './Content/Card';
import CardTitlebar from "./Titlebar/Card";
import SettingModal from "./SettingModal";
import NavigatePage from "./NavigatePage";
import EditRecordModal from "@/components/EditRecordModal";
import ResizeableAndHideableSidebar from '@/components/ResizableAndHideableSidebar';

import { createDocumentItem, initAllDocumentItemParents } from "@/commands";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";

import { EFilterType } from "@/types/time";
import { ITimeRecord } from "@/types";

import useCard from './hooks/useCard';
import useArticle from "./hooks/useArticle";
import useExitFocusMode from "./hooks/useExitFocusMode";
import useEditDailyNote from "@/hooks/useEditDailyNote";
import useDocumentsStore from "@/stores/useDocumentsStore";
import useDailyNoteStore from "@/stores/useDailyNoteStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";

import loadable from "@loadable/component";

import styles from './index.module.less';
import classnames from "classnames";

const ArticleList = loadable(() => import('./List/ArticleList'));
const DocumentList = loadable(() => import('./List/DocumentList'));
const DailyList = loadable(() => import('./List/DailyList'));
const TimeRecordList = loadable(() => import('./List/TimeRecord'));
const ProjectList = loadable(() => import('./List/ProjectList'));
const PdfList = loadable(() => import('./List/PdfList'));

const ArticleContent = loadable(() => import('./Content/Article'));
const DocumentContent = loadable(() => import('./Content/Document'));
const DailyNoteContent = loadable(() => import('./Content/DailyNote'));
const TimeRecordContent = loadable(() => import('./Content/TimeRecord'));
const ProjectContent = loadable(() => import('./Content/Project'));
const PdfContent = loadable(() => import('./Content/Pdf'));

const ArticleTitlebar = loadable(() => import('./Titlebar/Article'));
const DocumentTitlebar = loadable(() => import('./Titlebar/Document'));
const DailyNoteTitlebar = loadable(() => import('./Titlebar/DailyNote'));
const TimeRecordTitlebar = loadable(() => import('./Titlebar/TimeRecord'));
const ProjectTitlebar = loadable(() => import('./Titlebar/Project'));
const PdfTitlebar = loadable(() => import('./Titlebar/Pdf'));

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

  const {
    activeCardTag,
    selectCategory,
    leftCardIds,
    rightCardIds,
    leftActiveCardId,
    rightActiveCardId,
    onCreateCard,
    onDeleteCard,
    onClickCard,
    onCtrlClickCard,
    onClickTab,
    onCloseTab,
    onMoveCard,
    onCloseOtherTabs,
    onSelectCategoryChange,
    onActiveCardTagChange,
    filteredCards,
    updateCard,
  } = useCard();

  const {
    articles,
    activeArticleId,
    readonly,
    initValue,
    editingArticle,
    wordsCount,
    onContentChange,
    onInit,
    onDeleteTag,
    onAddTag,
    onTitleChange,
    saveArticle,
    toggleIsTop,
    toggleReadOnly,
    handleAddNewArticle,
    handleClickArticle,
    quitEditArticle,
    handleDeleteArticle,
  } = useArticle();

  const location = useLocation();
  const navigate = useNavigate();

  const {
    addDocumentItem,
    activeDocumentId,
  } = useDocumentsStore(state => ({
    addDocumentItem: state.addDocumentItem,
    activeDocumentId: state.activeDocumentId,
  }));

  const addNewDocumentItem = useMemoizedFn(async () => {
    if (!activeDocumentId) return;
    const itemId = await createDocumentItem(DEFAULT_CREATE_DOCUMENT_ITEM);
    addDocumentItem(activeDocumentId, itemId);
  });

  const handleQuitEditDocument = useMemoizedFn(() => {
    if (!activeDocumentId) return;
    useDocumentsStore.setState({
      activeDocumentId: null,
      activeDocumentItem: null,
    })
  });

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

  const [dailyNoteReadonly, setDailyNoteReadonly] = useState<boolean>(false);

  const {
    dailyNotes,
    activeDailyId,
  } = useDailyNoteStore(state => ({
    dailyNotes: state.dailyNotes,
    activeDailyId: state.activeDailyId,
  }));

  const {
    editingDailyNote,
    onInit: onInitEditingDailyNote,
    onContentChange: onEditingDailyNoteContentChange,
    createNewDailyNote,
    saveDailyNote,
    quitEditDailyNote,
    handleDeleteDailyNote,
  } = useEditDailyNote(activeDailyId);

  const toggleDailyNoteReadonly = useMemoizedFn(() => {
    setDailyNoteReadonly(!dailyNoteReadonly);
  });

  const [editAction, setEditAction] = useState<'create' | 'edit' | null>(null);
  const [editRecordModalOpen, setEditRecordModalOpen] = useState<boolean>(false);
  const [editingTimeRecord, setEditingTimeRecord] = useState<ITimeRecord | null>(null);

  const {
    timeRecords,
    filterType,
    filterValue,
    createTimeRecord,
    deleteTimeRecord,
    updateTimeRecord,
  } = useTimeRecordStore((state) => ({
    timeRecords: state.timeRecords,
    filterType: state.filterType,
    filterValue: state.filterValue,
    createTimeRecord: state.createTimeRecord,
    deleteTimeRecord: state.deleteTimeRecord,
    updateTimeRecord: state.updateTimeRecord,
  }));

  const onFilterValueChange = useMemoizedFn((value: string | string[]) => {
    useTimeRecordStore.setState({
      filterValue: value,
    })
  });

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

  const onSelectFilterTypeChange = useMemoizedFn((type: EFilterType) => {
    let filterValue = '';
    if (type === EFilterType.YEAR) {
      filterValue = new Date().getFullYear().toString();
    } else if (type === EFilterType.QUARTER) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const quarter = Math.floor(month / 3) + 1;
      filterValue = `${year}-Q${quarter}`;
    } else if (type === EFilterType.MONTH) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      filterValue = `${year}-${month}`;
    } else if (type === EFilterType.WEEK) {
      const now = new Date();
      const year = now.getFullYear();
      const week = Math.floor((now.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
      filterValue = `${year}-${week}周`;
    } else if (type === EFilterType.DATE) {
      filterValue = dayjs().format('YYYY-MM-DD');
    }
    useTimeRecordStore.setState({
      filterType: type,
      filterValue,
    });
  })
  
  useEffect(() => {
    // 如果当前路是 /，重定向到 /cards
    if (location.pathname === '/') {
      navigate('/cards');
    }
  }, [location, navigate]);

  return (
    <div
      className={classnames(styles.container, { [styles.focusMode]: focusMode })}
    >
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
        <Sidebar
          activeCardTag={activeCardTag}
          onActiveCardTagChange={onActiveCardTagChange}
        />
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
          <Route path="/cards/" element={(
            <CardList
              activeCardIds={[leftActiveCardId, rightActiveCardId].filter(Boolean) as number[]}
              onClickCard={onClickCard}
              onCtrlClickCard={onCtrlClickCard}
              onDeleteCard={onDeleteCard}
              updateCard={updateCard}
              cards={filteredCards}
              selectCategory={selectCategory}
              onSelectCategoryChange={onSelectCategoryChange}
            />
          )}/>
          <Route path="/articles/" element={(
            <ArticleList
              activeArticleId={activeArticleId}
              articles={articles}
              onClickArticle={handleClickArticle}
            />
          )}/>
          <Route path="/documents/" element={(
            <DocumentList/>
          )}/>
          <Route path="/daily/" element={(
            <DailyList
              dailyNotes={dailyNotes}
              activeDailyId={activeDailyId}
            />
          )}/>
          <Route path="/timeRecord/" element={(
            <TimeRecordList
              timeRecords={timeRecords}
              filterType={filterType}
              filterValue={filterValue}
              onSelectFilterTypeChange={onSelectFilterTypeChange}
              onFilterValueChange={onFilterValueChange}
              deleteTimeRecord={deleteTimeRecord}
              updateTimeRecord={updateTimeRecord}
              onClickEdit={onEditTimeRecord}
            />
          )}/>
          <Route path={"/projects/"} element={(
            <ProjectList/>
          )}/>
          <Route path={"/pdf"} element={(
            <PdfList />
          )} />
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
            <Route path="/" element={<Titlebar/>}>
              <Route path="cards/" element={(
                <CardTitlebar createCard={onCreateCard}/>
              )}/>
              <Route path="articles/" element={(
                <ArticleTitlebar
                  readonly={readonly}
                  toggleReadOnly={toggleReadOnly}
                  isTop={!!editingArticle?.isTop}
                  toggleIsTop={toggleIsTop}
                  quitEdit={quitEditArticle}
                  createArticle={handleAddNewArticle}
                  deleteArticle={handleDeleteArticle}
                />
              )}/>
              <Route path={"documents/"} element={(
                <DocumentTitlebar
                  createDocument={addNewDocumentItem}
                  quitEditDocument={handleQuitEditDocument}
                />
              )}/>
              <Route path={"daily/"} element={(
                <DailyNoteTitlebar
                  createDailyNote={createNewDailyNote}
                  readonly={dailyNoteReadonly}
                  toggleReadOnly={toggleDailyNoteReadonly}
                  quitEdit={quitEditDailyNote}
                  deleteDailyNote={handleDeleteDailyNote}
                />
              )}/>
              <Route path="timeRecord/" element={(
                <TimeRecordTitlebar
                  onCreateNewTimeRecord={onCreateNewTimeRecord}
                />
              )}/>
              <Route path={"projects/"} element={(
                <ProjectTitlebar/>
              )}/>
              <Route path={"pdf"} element={(
                <PdfTitlebar />
              )} />
            </Route>
          </Routes>
        </div>
        <div className={styles.content}>
          <Routes>
            <Route path="/cards/" element={(
              <CardContent
                leftCardIds={leftCardIds}
                rightCardIds={rightCardIds}
                leftActiveCardId={leftActiveCardId}
                rightActiveCardId={rightActiveCardId}
                onClickCard={onClickCard}
                onClickTab={onClickTab}
                onCloseTab={onCloseTab}
                onMoveCard={onMoveCard}
                onCloseOtherTabs={onCloseOtherTabs}
              />
            )} />
            <Route path="/articles/" element={(
              <ArticleContent
                key={activeArticleId}
                initValue={initValue}
                editingArticle={editingArticle}
                wordsCount={wordsCount}
                onContentChange={onContentChange}
                onInit={onInit}
                onDeleteTag={onDeleteTag}
                onAddTag={onAddTag}
                onTitleChange={onTitleChange}
                saveArticle={saveArticle}
                readonly={readonly}
              />
            )} />
            <Route path="/documents/" element={(
              <DocumentContent />
            )} />
            <Route path="/daily/" element={(
              <DailyNoteContent
                key={activeDailyId}
                readonly={dailyNoteReadonly}
                editingDailyNote={editingDailyNote}
                onInit={onInitEditingDailyNote}
                onContentChange={onEditingDailyNoteContentChange}
                saveDailyNote={saveDailyNote}
              />
            )} />
            <Route path="/timeRecord/" element={(
              <TimeRecordContent
                filterType={filterType}
                filterValue={filterValue}
                timeRecords={timeRecords}
              />
            )} />
            <Route path={'/projects/'} element={(
              <ProjectContent />
            )} />
            <Route path={'/pdf'} element={(
              <PdfContent />
            )} />
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