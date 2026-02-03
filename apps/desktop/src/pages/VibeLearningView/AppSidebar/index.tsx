import { memo, useState, useCallback, useRef } from "react";
import { VLNote } from "@/types/vibe-learning";

import AppListView, { AppListViewRef } from "./AppListView";
import NoteEditorView from "./NoteEditorView";
import QuizGenerateModal from "./apps/QuizGenerateModal";
import OutlineGenerateModal from "./apps/OutlineGenerateModal";
import MindMapGenerateModal from "./apps/MindMapGenerateModal";

export type AppSidebarView =
  | "app-list" // 应用列表 + 笔记列表
  | "note-editor"; // 笔记编辑器

interface AppSidebarProps {
  projectId: number;
  mainDbName: string;
}

const AppSidebar = memo((props: AppSidebarProps) => {
  const { projectId, mainDbName } = props;

  const [currentView, setCurrentView] = useState<AppSidebarView>("app-list");
  const [editingNote, setEditingNote] = useState<VLNote | null>(null);
  const [showQuizGenerateModal, setShowQuizGenerateModal] = useState(false);
  const [showOutlineGenerateModal, setShowOutlineGenerateModal] =
    useState(false);
  const [showMindMapGenerateModal, setShowMindMapGenerateModal] =
    useState(false);
  const appListViewRef = useRef<AppListViewRef>(null);

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
    <div className="w-full h-full flex flex-col border-l border-[#e8e8e8] dark:border-[#2a2a2a]">
      {currentView === "app-list" && (
        <AppListView
          ref={appListViewRef}
          projectId={projectId}
          onOpenOutline={handleOpenOutline}
          onOpenQuiz={handleOpenQuiz}
          onOpenMindMap={handleOpenMindMap}
          onCreateNote={handleCreateNote}
          onEditNote={handleEditNote}
        />
      )}

      {currentView === "note-editor" && (
        <NoteEditorView
          projectId={projectId}
          note={editingNote}
          onBack={handleBack}
          onNoteSaved={handleNoteSaved}
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
    </div>
  );
});

AppSidebar.displayName = "AppSidebar";

export default AppSidebar;
