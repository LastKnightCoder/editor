import { memo, useState, useCallback, useRef } from "react";
import { VLNote } from "@/types/vibe-learning";

import AppListView, { AppListViewRef } from "./AppListView";
import NoteEditorView from "./NoteEditorView";
import OutlineApp from "./apps/OutlineApp";
import QuizApp from "./apps/QuizApp";

export type AppSidebarView =
  | "app-list" // 应用列表 + 笔记列表
  | "outline" // 大纲应用
  | "quiz" // 测验应用
  | "note-editor"; // 笔记编辑器

interface AppSidebarProps {
  projectId: number;
  mainDbName: string;
}

const AppSidebar = memo((props: AppSidebarProps) => {
  const { projectId, mainDbName } = props;

  const [currentView, setCurrentView] = useState<AppSidebarView>("app-list");
  const [editingNote, setEditingNote] = useState<VLNote | null>(null);
  const appListViewRef = useRef<AppListViewRef>(null);

  // 打开大纲应用
  const handleOpenOutline = useCallback(() => {
    setCurrentView("outline");
  }, []);

  // 打开测验应用
  const handleOpenQuiz = useCallback(() => {
    setCurrentView("quiz");
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

  // 大纲生成创建了笔记的回调
  const handleOutlineNoteCreated = useCallback((_note: VLNote) => {
    // 刷新笔记列表
    appListViewRef.current?.refreshNotes();
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
          onCreateNote={handleCreateNote}
          onEditNote={handleEditNote}
        />
      )}

      {currentView === "outline" && (
        <OutlineApp
          projectId={projectId}
          mainDbName={mainDbName}
          onBack={handleBack}
          onNoteCreated={handleOutlineNoteCreated}
        />
      )}

      {currentView === "quiz" && (
        <QuizApp
          projectId={projectId}
          mainDbName={mainDbName}
          onBack={handleBack}
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
    </div>
  );
});

AppSidebar.displayName = "AppSidebar";

export default AppSidebar;
