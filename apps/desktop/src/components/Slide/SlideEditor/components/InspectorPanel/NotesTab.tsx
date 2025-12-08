import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { App } from "antd";
import { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";
import useSlideStore from "@/stores/useSlideStore";
import { DEFAULT_CARD_CONTENT } from "@/constants";

const cls = {
  container: "flex flex-col h-full",
  header: "p-4 border-b border-gray-100 dark:border-gray-800",
  sectionTitle: "text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2",
  description: "text-xs text-gray-400",
  editorContainer: "flex-1 min-h-0 overflow-y-auto",
  editorWrapper:
    "h-full border-t border-gray-100 dark:border-gray-800",
  actions: "p-4 border-t border-gray-100 dark:border-gray-800",
  saveButton:
    "w-full px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg shadow-indigo-200/40 hover:opacity-90 disabled:opacity-50",
  emptyState: "text-sm text-gray-400 text-center py-8",
};

const NotesTab = () => {
  const { message } = App.useApp();
  const editorRef = useRef<EditorRef>(null);
  const { currentDeckId, currentPageId, pagesByDeck, updatePage } =
    useSlideStore((state) => ({
      currentDeckId: state.currentDeckId,
      currentPageId: state.currentPageId,
      pagesByDeck: state.pagesByDeck,
      updatePage: state.updatePage,
    }));

  const currentPage = useMemo(() => {
    if (!currentDeckId || !currentPageId) return null;
    const pages = pagesByDeck[currentDeckId] ?? [];
    return pages.find((p) => p.id === currentPageId) ?? null;
  }, [currentDeckId, currentPageId, pagesByDeck]);

  const [notesDraft, setNotesDraft] = useState<Descendant[]>(DEFAULT_CARD_CONTENT);
  const [isSaving, setIsSaving] = useState(false);

  // 当切换页面时，通过 ref 同步备注内容到 Editor
  useEffect(() => {
    const newNotes = currentPage?.speakerNotes && currentPage.speakerNotes.length > 0
      ? currentPage.speakerNotes
      : DEFAULT_CARD_CONTENT;
    setNotesDraft(newNotes);
    // 使用 ref 同步 Editor 内容
    if (editorRef.current) {
      editorRef.current.setEditorValue(newNotes);
    }
  }, [currentPage?.id, currentPage?.speakerNotes]);

  const handleNotesChange = useCallback((value: Descendant[]) => {
    setNotesDraft(value);
  }, []);

  const handleSave = async () => {
    if (!currentPage) return;
    setIsSaving(true);
    try {
      await updatePage({
        id: currentPage.id,
        speakerNotes: notesDraft,
      });
      message.success("备注已保存");
    } catch (error) {
      console.error(error);
      message.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentPage) {
    return (
      <div className={cls.emptyState}>
        请先选择一个页面
      </div>
    );
  }

  return (
    <div className={cls.container}>
      <div className={cls.header}>
        <div className={cls.sectionTitle}>演讲者备注</div>
        <p className={cls.description}>
          在演示模式下，备注仅对演讲者可见，观众看不到
        </p>
      </div>

      <div className={cls.editorContainer}>
        <div className={cls.editorWrapper}>
          <Editor
            ref={editorRef}
            readonly={false}
            initValue={notesDraft}
            onChange={handleNotesChange}
            className="h-full p-3"
          />
        </div>
      </div>

      <div className={cls.actions}>
        <button
          className={cls.saveButton}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存备注"}
        </button>
      </div>
    </div>
  );
};

export default NotesTab;
