import { memo, useState, useEffect } from "react";
import type { Descendant } from "slate";
import useExtNoteInsertStore from "@/stores/useExtNoteInsertStore";
import { getContentById } from "@/commands";
import { getEditorText } from "@/utils";
import InsertNoteToTreeModal from "@/pages/VibeLearningView/AppSidebar/components/InsertNoteToTreeModal";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

/**
 * 全局插入笔记模态框
 * 由浏览器扩展通过 WebSocket RPC 触发，使用 zustand store 管理状态
 */
const ExtNoteInsertModal = memo(() => {
  const { isOpen, mode, contentId, title, insertMode, onSuccess, closeModal } =
    useExtNoteInsertStore();

  const [noteContent, setNoteContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [noteTitle, setNoteTitle] = useState("");

  // 打开弹窗时加载内容
  useEffect(() => {
    if (!isOpen || !contentId) {
      setNoteContent(DEFAULT_CONTENT);
      setNoteTitle("");
      return;
    }

    (async () => {
      try {
        const content = await getContentById(contentId);
        if (content) {
          setNoteContent(content.content);
          setNoteTitle(
            title || getEditorText(content.content, 20) || "浏览器笔记",
          );
        }
      } catch (error) {
        console.error("[ExtNoteInsertModal] 加载内容失败:", error);
      }
    })();
  }, [isOpen, contentId, title]);

  return (
    <InsertNoteToTreeModal
      mode={mode}
      open={isOpen}
      noteTitle={noteTitle}
      noteContent={noteContent}
      noteContentId={contentId}
      insertMode={insertMode}
      onCancel={closeModal}
      onSuccess={() => {
        onSuccess?.();
        closeModal();
      }}
    />
  );
});

ExtNoteInsertModal.displayName = "ExtNoteInsertModal";

export default ExtNoteInsertModal;
