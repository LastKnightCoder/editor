import { memo, useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { App } from "antd";
import {
  ArrowLeftOutlined,
  MoreOutlined,
  CreditCardOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useMemoizedFn, useUnmount, useRafInterval } from "ahooks";
import { LoadingSpinner } from "./components";
import { SelectDropDown } from "@tau/shared";

import { Editor, EditorRef } from "@tau/editor/src";
import ErrorBoundary from "@/components/ErrorBoundary";
import { VLNote } from "@/types/vibe-learning";
import {
  createVLNote,
  updateVLNote,
  deleteVLNote,
} from "@/commands/vibe-learning";
import { createContent, updateContent, getContentById } from "@/commands";
import { buildCardFromContent } from "@/commands/card";
import { getContentLength, getEditorText, importFromMarkdown } from "@/utils";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
} from "@/editor-extensions";
import useTabStore from "@/stores/useTabStore";
import useOutlineGenerationStore from "@/stores/useOutlineGenerationStore";
import { TabType } from "@/types/tab";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
];

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

interface NoteEditorViewProps {
  projectId: number;
  note: VLNote | null;
  onBack: () => void;
  onNoteSaved: (note: VLNote) => void;
}

const NoteEditorView = memo((props: NoteEditorViewProps) => {
  const { projectId, note, onBack, onNoteSaved } = props;
  const { message, modal } = App.useApp();
  const openInNewTab = useTabStore((state) => state.openInNewTab);

  // 大纲生成状态
  const isGenerating = useOutlineGenerationStore((state) =>
    note ? state.generatingNoteIds.has(note.id) : false,
  );
  const streamingContent = useOutlineGenerationStore((state) =>
    note ? state.generatingContent[note.id] : undefined,
  );
  const generationError = useOutlineGenerationStore((state) =>
    note ? state.generationErrors[note.id] : undefined,
  );

  const editorRef = useRef<EditorRef>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [currentNote, setCurrentNote] = useState<VLNote | null>(note);
  const [contentId, setContentId] = useState<number | null>(
    note?.contentId || null,
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // 内容是否有变化
  const contentChangedRef = useRef(false);

  // 监听流式内容变化，更新编辑器
  useEffect(() => {
    if (streamingContent && editorRef.current) {
      try {
        const slateContent = importFromMarkdown(streamingContent);
        setContent(slateContent);
        editorRef.current.setEditorValue(slateContent);
      } catch (e) {
        console.error("Failed to parse streaming content:", e);
      }
    }
  }, [streamingContent]);

  // 加载笔记内容
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      try {
        if (note) {
          // 编辑现有笔记
          setTitle(note.title);
          setCurrentNote(note);
          setContentId(note.contentId);
          const contentData = await getContentById(note.contentId);
          if (contentData) {
            setContent(contentData.content);
          }
        } else {
          // 新建笔记
          setTitle("");
          setCurrentNote(null);
          setContentId(null);
          setContent(DEFAULT_CONTENT);
        }
      } catch (error) {
        console.error("Failed to load note content:", error);
        message.error("加载笔记失败");
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, [note, message]);

  // 保存笔记
  const saveNote = useMemoizedFn(async () => {
    if (!contentChangedRef.current && currentNote) return currentNote;

    setSaving(true);
    try {
      const count = getContentLength(content);
      const autoTitle = title || getEditorText(content, 20) || "无标题笔记";

      if (currentNote && contentId) {
        // 更新现有笔记
        await updateContent(contentId, content);
        if (title !== currentNote.title) {
          const updated = await updateVLNote({
            id: currentNote.id,
            title: autoTitle,
          });
          if (updated) {
            setCurrentNote(updated);
          }
        }
        contentChangedRef.current = false;
        return currentNote;
      } else {
        // 创建新笔记
        const newContentId = await createContent(content, count);
        if (!newContentId) {
          throw new Error("Failed to create content");
        }
        setContentId(newContentId);

        const newNote = await createVLNote({
          projectId,
          contentId: newContentId,
          title: autoTitle,
        });
        setCurrentNote(newNote);
        setTitle(newNote.title);
        onNoteSaved(newNote);
        contentChangedRef.current = false;
        return newNote;
      }
    } catch (error) {
      console.error("Failed to save note:", error);
      message.error("保存笔记失败");
      return null;
    } finally {
      setSaving(false);
    }
  });

  // 自动保存（生成中不自动保存，由生成逻辑负责保存）
  useRafInterval(() => {
    if (contentChangedRef.current && !isGenerating) {
      saveNote();
    }
  }, 2000);

  // 组件卸载时保存
  useUnmount(() => {
    if (contentChangedRef.current) {
      saveNote();
    }
  });

  // 处理内容变化（生成中不处理，避免冲突）
  const handleContentChange = useMemoizedFn((newContent: Descendant[]) => {
    if (isGenerating) return;
    setContent(newContent);
    contentChangedRef.current = true;
  });

  // 处理标题变化
  const handleTitleChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
      contentChangedRef.current = true;
    },
  );

  // 完成标题编辑
  const handleTitleBlur = useMemoizedFn(() => {
    setIsEditingTitle(false);
    if (contentChangedRef.current) {
      saveNote();
    }
  });

  // 转为卡片
  const handleConvertToCard = useMemoizedFn(async () => {
    // 先保存笔记
    const savedNote = await saveNote();
    if (!savedNote || !savedNote.contentId) {
      message.error("请先保存笔记");
      return;
    }

    try {
      const card = await buildCardFromContent(savedNote.contentId);
      message.success("已创建卡片");
      // 打开卡片详情
      openInNewTab(
        TabType.CardDetail,
        { id: card.id },
        undefined,
        getEditorText(card.content, 10),
      );
    } catch (error) {
      console.error("Failed to create card:", error);
      message.error("创建卡片失败");
    }
  });

  // 删除笔记
  const handleDelete = useMemoizedFn(() => {
    if (!currentNote) {
      onBack();
      return;
    }

    modal.confirm({
      title: "删除笔记",
      content: "确定要删除该笔记吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteVLNote(currentNote.id);
          message.success("笔记已删除");
          onBack();
        } catch (error) {
          console.error("Failed to delete note:", error);
          message.error("删除笔记失败");
        }
      },
    });
  });

  // 更多菜单项
  interface MenuItem {
    key: string;
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    onClick: () => void;
  }

  const moreMenuItems: MenuItem[] = [
    {
      key: "convert-to-card",
      icon: <CreditCardOutlined />,
      label: "转为卡片",
      onClick: handleConvertToCard,
    },
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除笔记",
      danger: true,
      onClick: handleDelete,
    },
  ];

  // 处理菜单项选择
  const handleMenuSelect = useMemoizedFn((item: MenuItem) => {
    item.onClick();
  });

  // 返回并保存
  const handleBack = useMemoizedFn(async () => {
    if (contentChangedRef.current) {
      await saveNote();
    }
    onBack();
  });

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="px-4 py-3 border-b border-[#e8e8e8] dark:border-[#2a2a2a] shrink-0 flex items-center gap-3">
        <button
          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer border-none bg-transparent"
          onClick={handleBack}
        >
          <ArrowLeftOutlined className="text-[#666] dark:text-[#999]" />
        </button>

        <div className="flex-1 min-w-0">
          {isEditingTitle && !isGenerating ? (
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === "Enter" && handleTitleBlur()}
              placeholder="请输入标题"
              autoFocus
              className="w-full border-none bg-transparent p-0 text-base font-medium text-[#333] dark:text-[#e0e0e0] outline-none placeholder:text-[#999]"
            />
          ) : (
            <h3
              className="text-base font-medium text-[#333] dark:text-[#e0e0e0] m-0 cursor-pointer truncate"
              onClick={() => !isGenerating && setIsEditingTitle(true)}
            >
              {title || "无标题笔记"}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isGenerating && (
            <span className="text-xs text-blue-500 flex items-center">
              <LoadingSpinner size="small" className="mr-1" />
              生成中
            </span>
          )}
          {!isGenerating && saving && (
            <span className="text-xs text-[#999] flex items-center">
              <LoadingSpinner size="small" className="mr-1" />
              保存中
            </span>
          )}
          {!isGenerating && (
            <button
              ref={moreButtonRef}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer border-none bg-transparent"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
            >
              <MoreOutlined className="text-[#666] dark:text-[#999]" />
            </button>
          )}
          <SelectDropDown
            items={moreMenuItems}
            selectedKey=""
            show={showMoreMenu}
            onClose={() => setShowMoreMenu(false)}
            onSelect={handleMenuSelect}
            triggerElement={moreButtonRef.current}
            getKey={(item) => item.key}
            width={160}
            renderItem={(item) => (
              <div
                className={`flex items-center gap-2 ${item.danger ? "text-red-500" : ""}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </div>
            )}
          />
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className="flex-1 overflow-auto p-4">
        {/* 生成错误提示 */}
        {generationError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <p className="text-sm text-red-600 dark:text-red-400">
              生成失败: {generationError}
            </p>
          </div>
        )}

        <ErrorBoundary>
          <Editor
            key={currentNote?.id || "new"}
            ref={editorRef}
            initValue={content}
            onChange={handleContentChange}
            extensions={customExtensions}
            readonly={isGenerating}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
});

NoteEditorView.displayName = "NoteEditorView";

export default NoteEditorView;
