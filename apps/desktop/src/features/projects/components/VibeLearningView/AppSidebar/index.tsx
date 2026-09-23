import { memo, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { VLNote } from "@/types/vibe-learning";
import { getVLNotesByProjectId } from "@/commands/vibe-learning";

import AppListView, { AppListViewRef } from "./AppListView";
import NoteEditorView from "./NoteEditorView";
import QuizGenerateModal from "./apps/QuizGenerateModal";
import OutlineGenerateModal from "./apps/OutlineGenerateModal";
import HighlightsGenerateModal from "./apps/HighlightsGenerateModal";
import ArticleGenerateModal from "./apps/ArticleGenerateModal";
import MindMapGenerateModal from "./apps/MindMapGenerateModal";
import PPTGenerateModal from "./apps/PPTGenerateModal";
import PPTEditModal from "./apps/PPTEditModal";
import ReportGenerateModal from "./apps/ReportGenerateModal";
import ReportEditModal from "./apps/ReportEditModal";
import PodcastGenerateModal from "./apps/PodcastGenerateModal";

export type AppSidebarView =
  | "app-list" // 应用列表 + 笔记列表
  | "note-editor"; // 笔记编辑器

export interface AppSidebarRef {
  openNoteByContentId: (contentId: number) => Promise<void>;
}

interface AppSidebarProps {
  projectId: number;
  mainDbName: string;
  onResourcesChange: () => void;
}

const AppSidebar = memo(
  forwardRef<AppSidebarRef, AppSidebarProps>((props, ref) => {
    const { projectId, mainDbName, onResourcesChange } = props;

    const [currentView, setCurrentView] = useState<AppSidebarView>("app-list");
    const [editingNote, setEditingNote] = useState<VLNote | null>(null);
    const [showQuizGenerateModal, setShowQuizGenerateModal] = useState(false);
    const [showOutlineGenerateModal, setShowOutlineGenerateModal] = useState(false);
    const [showHighlightsGenerateModal, setShowHighlightsGenerateModal] = useState(false);
    const [showArticleGenerateModal, setShowArticleGenerateModal] = useState(false);
    const [showMindMapGenerateModal, setShowMindMapGenerateModal] = useState(false);
    const [showPPTGenerateModal, setShowPPTGenerateModal] = useState(false);
    const [showPPTEditModal, setShowPPTEditModal] = useState(false);
    const [editingPPTNote, setEditingPPTNote] = useState<VLNote | null>(null);
    const [showReportGenerateModal, setShowReportGenerateModal] = useState(false);
    const [showReportEditModal, setShowReportEditModal] = useState(false);
    const [editingReportNote, setEditingReportNote] = useState<VLNote | null>(null);
    const [showPodcastGenerateModal, setShowPodcastGenerateModal] = useState(false);
    const appListViewRef = useRef<AppListViewRef>(null);

    useImperativeHandle(ref, () => ({
      openNoteByContentId: async (contentId: number) => {
        try {
          const notes = await getVLNotesByProjectId(projectId);
          const note = notes.find(n => n.contentId === contentId);
          if (note) {
            setEditingNote(note);
            setCurrentView("note-editor");
          }
        } catch (error) {
          console.error("Failed to open note by contentId:", error);
        }
      },
    }));

    // 打开大纲生成弹窗
    const handleOpenOutline = useCallback(() => {
      setShowOutlineGenerateModal(true);
    }, []);

    // 关闭大纲生成弹窗
    const handleCloseOutlineGenerate = useCallback(() => {
      setShowOutlineGenerateModal(false);
      // 刷新笔记列表
      setTimeout(() => {
        appListViewRef.current?.refreshNotes?.();
      }, 100);
    }, []);

    // 大纲生成创建了笔记的回调 - 自动打开该笔记
    const handleOutlineNoteCreated = useCallback((note: VLNote) => {
      // 刷新笔记列表
      appListViewRef.current?.refreshNotes();
      // 自动打开该笔记进行编辑
      setEditingNote(note);
      setCurrentView("note-editor");
    }, []);

    // 打开重点提炼弹窗
    const handleOpenHighlights = useCallback(() => {
      setShowHighlightsGenerateModal(true);
    }, []);

    // 关闭重点提炼弹窗
    const handleCloseHighlightsGenerate = useCallback(() => {
      setShowHighlightsGenerateModal(false);
      // 刷新笔记列表
      setTimeout(() => {
        appListViewRef.current?.refreshNotes?.();
      }, 100);
    }, []);

    // 重点提炼创建了笔记的回调 - 自动打开该笔记
    const handleHighlightsNoteCreated = useCallback((note: VLNote) => {
      // 刷新笔记列表
      appListViewRef.current?.refreshNotes();
      // 自动打开该笔记进行编辑
      setEditingNote(note);
      setCurrentView("note-editor");
    }, []);

    const handleOpenArticle = useCallback(() => {
      setShowArticleGenerateModal(true);
    }, []);

    const handleCloseArticleGenerate = useCallback(() => {
      setShowArticleGenerateModal(false);
      setTimeout(() => {
        appListViewRef.current?.refreshNotes?.();
      }, 100);
    }, []);

    const handleArticleNoteCreated = useCallback((note: VLNote) => {
      appListViewRef.current?.refreshNotes();
      setEditingNote(note);
      setCurrentView("note-editor");
    }, []);

    // 打开测验生成弹窗
    const handleOpenQuiz = useCallback(() => {
      setShowQuizGenerateModal(true);
    }, []);

    // 关闭测验生成弹窗
    const handleCloseQuizGenerate = useCallback(() => {
      setShowQuizGenerateModal(false);
      // 刷新测验集列表
      setTimeout(() => {
        appListViewRef.current?.refreshQuizSets?.();
      }, 100);
    }, []);

    // 打开思维导图生成弹窗
    const handleOpenMindMap = useCallback(() => {
      setShowMindMapGenerateModal(true);
    }, []);

    // 关闭思维导图生成弹窗
    const handleCloseMindMapGenerate = useCallback(() => {
      setShowMindMapGenerateModal(false);
      // 刷新笔记列表
      setTimeout(() => {
        appListViewRef.current?.refreshNotes?.();
      }, 100);
    }, []);

    // 思维导图生成创建了笔记的回调 - 自动打开该笔记
    const handleMindMapNoteCreated = useCallback((note: VLNote) => {
      // 刷新笔记列表
      appListViewRef.current?.refreshNotes();
      // 自动打开该笔记进行编辑
      setEditingNote(note);
      setCurrentView("note-editor");
    }, []);

    // 打开 PPT 生成弹窗
    const handleOpenPPT = useCallback(() => {
      setShowPPTGenerateModal(true);
    }, []);

    // 关闭 PPT 生成弹窗
    const handleClosePPTGenerate = useCallback(() => {
      setShowPPTGenerateModal(false);
      // 刷新笔记列表
      setTimeout(() => {
        appListViewRef.current?.refreshNotes?.();
      }, 100);
    }, []);

    // PPT 生成创建了笔记的回调 - 自动打开该笔记
    const handlePPTNoteCreated = useCallback((note: VLNote) => {
      // 刷新笔记列表
      appListViewRef.current?.refreshNotes();
      // 自动打开该笔记进行编辑
      setEditingNote(note);
      setCurrentView("note-editor");
    }, []);

    // 打开 PPT 编辑弹窗
    const handleEditPPT = useCallback((note: VLNote) => {
      setEditingPPTNote(note);
      setShowPPTEditModal(true);
    }, []);

    // 关闭 PPT 编辑弹窗
    const handleClosePPTEdit = useCallback(() => {
      setShowPPTEditModal(false);
      setEditingPPTNote(null);
      // 注意：不在这里刷新，因为 handlePPTNoteUpdated 已经在保存成功时刷新了
      // 避免重复刷新造成额外查询
    }, []);

    // PPT 编辑更新了笔记的回调
    const handlePPTNoteUpdated = useCallback(() => {
      // 刷新笔记列表
      appListViewRef.current?.refreshNotes();
    }, []);

    // 打开报告生成弹窗
    const handleOpenReport = useCallback(() => {
      setShowReportGenerateModal(true);
    }, []);

    // 关闭报告生成弹窗
    const handleCloseReportGenerate = useCallback(() => {
      setShowReportGenerateModal(false);
      setTimeout(() => {
        appListViewRef.current?.refreshNotes?.();
      }, 100);
    }, []);

    // 报告生成创建了笔记的回调 - 自动打开该笔记
    const handleReportNoteCreated = useCallback((note: VLNote) => {
      appListViewRef.current?.refreshNotes();
      setEditingNote(note);
      setCurrentView("note-editor");
    }, []);

    // 打开报告编辑弹窗
    const handleEditReport = useCallback((note: VLNote) => {
      setEditingReportNote(note);
      setShowReportEditModal(true);
    }, []);

    // 关闭报告编辑弹窗
    const handleCloseReportEdit = useCallback(() => {
      setShowReportEditModal(false);
      setEditingReportNote(null);
    }, []);

    // 报告编辑更新了笔记的回调
    const handleReportNoteUpdated = useCallback(() => {
      appListViewRef.current?.refreshNotes();
    }, []);

    // 打开播客生成弹窗
    const handleOpenPodcast = useCallback(() => {
      setShowPodcastGenerateModal(true);
    }, []);

    // 关闭播客生成弹窗
    const handleClosePodcastGenerate = useCallback(() => {
      setShowPodcastGenerateModal(false);
      // 刷新笔记列表
      setTimeout(() => {
        appListViewRef.current?.refreshNotes?.();
      }, 100);
    }, []);

    // 播客生成创建了笔记的回调 - 自动打开该笔记
    const handlePodcastNoteCreated = useCallback((note: VLNote) => {
      // 刷新笔记列表
      appListViewRef.current?.refreshNotes();
      // 自动打开该笔记进行编辑
      setEditingNote(note);
      setCurrentView("note-editor");
    }, []);

    // 打开笔记编辑器（新建）
    const handleCreateNote = useCallback(() => {
      setEditingNote(null);
      setCurrentView("note-editor");
    }, []);

    // 打开笔记编辑器（编辑）
    const handleEditNote = useCallback((note: VLNote) => {
      setEditingNote(note);
      setCurrentView("note-editor");
    }, []);

    // 返回应用列表（带刷新）
    const handleBack = useCallback(() => {
      setCurrentView("app-list");
      setEditingNote(null);
      // 刷新笔记列表
      setTimeout(() => {
        appListViewRef.current?.refreshNotes();
      }, 100);
    }, []);

    // 笔记保存成功后的回调
    const handleNoteSaved = useCallback((note: VLNote) => {
      setEditingNote(note);
    }, []);

    return (
      <div className="border-line-1 flex h-full w-full flex-col border-l">
        {currentView === "app-list" && (
          <AppListView
            ref={appListViewRef}
            projectId={projectId}
            mainDbName={mainDbName}
            onResourcesChange={onResourcesChange}
            onOpenOutline={handleOpenOutline}
            onOpenHighlights={handleOpenHighlights}
            onOpenArticle={handleOpenArticle}
            onOpenQuiz={handleOpenQuiz}
            onOpenMindMap={handleOpenMindMap}
            onOpenPPT={handleOpenPPT}
            onOpenReport={handleOpenReport}
            onOpenPodcast={handleOpenPodcast}
            onCreateNote={handleCreateNote}
            onEditNote={handleEditNote}
            onEditPPT={handleEditPPT}
            onEditReport={handleEditReport}
          />
        )}

        {currentView === "note-editor" && (
          <NoteEditorView
            projectId={projectId}
            mainDbName={mainDbName}
            note={editingNote}
            onBack={handleBack}
            onNoteSaved={handleNoteSaved}
            onResourcesChange={onResourcesChange}
          />
        )}

        {/* 大纲生成弹窗 */}
        <OutlineGenerateModal
          open={showOutlineGenerateModal}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleCloseOutlineGenerate}
          onNoteCreated={handleOutlineNoteCreated}
        />

        {/* 重点提炼弹窗 */}
        <HighlightsGenerateModal
          open={showHighlightsGenerateModal}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleCloseHighlightsGenerate}
          onNoteCreated={handleHighlightsNoteCreated}
        />

        <ArticleGenerateModal
          open={showArticleGenerateModal}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleCloseArticleGenerate}
          onNoteCreated={handleArticleNoteCreated}
        />

        {/* 测验生成弹窗 */}
        <QuizGenerateModal
          open={showQuizGenerateModal}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleCloseQuizGenerate}
        />

        {/* 思维导图生成弹窗 */}
        <MindMapGenerateModal
          open={showMindMapGenerateModal}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleCloseMindMapGenerate}
          onNoteCreated={handleMindMapNoteCreated}
        />

        {/* PPT 生成弹窗 */}
        <PPTGenerateModal
          open={showPPTGenerateModal}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleClosePPTGenerate}
          onNoteCreated={handlePPTNoteCreated}
        />

        {/* PPT 编辑弹窗 */}
        <PPTEditModal
          open={showPPTEditModal}
          note={editingPPTNote}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleClosePPTEdit}
          onNoteUpdated={handlePPTNoteUpdated}
        />

        {/* 报告生成弹窗 */}
        <ReportGenerateModal
          open={showReportGenerateModal}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleCloseReportGenerate}
          onNoteCreated={handleReportNoteCreated}
        />

        {/* 报告编辑弹窗 */}
        <ReportEditModal
          open={showReportEditModal}
          note={editingReportNote}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleCloseReportEdit}
          onNoteUpdated={handleReportNoteUpdated}
        />

        {/* 播客生成弹窗 */}
        <PodcastGenerateModal
          open={showPodcastGenerateModal}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={handleClosePodcastGenerate}
          onNoteCreated={handlePodcastNoteCreated}
        />
      </div>
    );
  })
);

AppSidebar.displayName = "AppSidebar";

export default AppSidebar;
