import React, { useRef, useEffect, useState } from "react";
import { App } from "antd";
import { motion, AnimatePresence } from "motion/react";
import { IAnswer } from "@/types";
import { IExtension, EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import CustomModal from "@/components/CustomModal";
import { Descendant } from "slate";
import { useMemoizedFn, useUnmount } from "ahooks";
import useEditContent from "@/hooks/useEditContent";
import { buildCardFromContent } from "@/commands/card";
import { buildArticleFromContent } from "@/commands/article";
import { BsCardText } from "react-icons/bs";
import { defaultCardEventBus, getContentLength } from "@/utils";
import { formatDate } from "@/utils";
import {
  LeftOutlined,
  RightOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { getAnswerContentStatus } from "@/utils/answer-content";
import useExtNoteInsertStore from "@/stores/useExtNoteInsertStore";
import { getEditorText } from "@/utils/editor";
import EditTitleModal from "@/components/EditTitleModal";

interface AnswerModalProps {
  visible: boolean;
  selectedAnswer: IAnswer | null;
  extensions: IExtension[];
  onClose: () => void;
  onAnswerChange?: (answer: IAnswer) => void;
  readOnly?: boolean;
  customTitle?: string;
  currentIndex?: number;
  total?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

const AnswerModal: React.FC<AnswerModalProps> = ({
  visible,
  selectedAnswer,
  extensions,
  onClose,
  onAnswerChange,
  readOnly = false,
  customTitle = "答案详情",
  currentIndex,
  total,
  onPrev,
  onNext,
}) => {
  const { message } = App.useApp();
  const editorRef = useRef<EditorRef>(null);
  const { throttleHandleEditorContentChange } = useEditContent(selectedAnswer?.id, data => {
    editorRef.current?.setEditorValue(data);
  });

  // 使用 state 保存当前内容以支持实时字数更新
  const [currentContent, setCurrentContent] = useState<Descendant[]>(selectedAnswer?.content || []);

  // 当 selectedAnswer 变化时更新 currentContent
  useEffect(() => {
    if (selectedAnswer?.content) {
      setCurrentContent(selectedAnswer.content);
    }
  }, [selectedAnswer?.content]);

  const handleAnswerContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!selectedAnswer) {
      return;
    }
    setCurrentContent(content); // 更新本地状态以触发字数统计更新
    throttleHandleEditorContentChange(content);
    const newAnswer = {
      ...selectedAnswer,
      content,
    };
    onAnswerChange?.(newAnswer);
  });

  useUnmount(() => {
    throttleHandleEditorContentChange.flush();
  });

  const [isCard, setIsCard] = useState(false);
  const [isArticle, setIsArticle] = useState(false);
  const [direction, setDirection] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [titleModalTarget, setTitleModalTarget] = useState<
    "article" | "project" | "document" | null
  >(null);

  useEffect(() => {
    if (selectedAnswer?.id && visible) {
      getAnswerContentStatus(selectedAnswer.id).then(status => {
        setIsCard(status.isCard);
        setIsArticle(status.isArticle);
      });
    } else {
      setIsCard(false);
      setIsArticle(false);
    }
  }, [selectedAnswer?.id, visible]);

  const reloadContentStatus = useMemoizedFn(async () => {
    if (!selectedAnswer?.id) {
      setIsCard(false);
      setIsArticle(false);
      return;
    }
    const status = await getAnswerContentStatus(selectedAnswer.id);
    setIsCard(status.isCard);
    setIsArticle(status.isArticle);
  });

  const handleBuildCard = useMemoizedFn(() => {
    if (!selectedAnswer?.id) return;
    throttleHandleEditorContentChange.flush();

    buildCardFromContent(selectedAnswer.id).then(card => {
      if (card) {
        setIsCard(true);
        defaultCardEventBus.createEditor().publishCardEvent("card:created", card);
        message.success("创建卡片成功");
        setDropdownOpen(false);
        void reloadContentStatus();
        // 通知父组件刷新答案类型
        onAnswerChange?.(selectedAnswer);
      } else {
        message.error("创建卡片失败");
      }
    });
  });

  const defaultProjectionTitle = useMemoizedFn(() => {
    if (!selectedAnswer?.id) return "";
    return getEditorText(currentContent, 20) || `答案 #${selectedAnswer.id}`;
  });

  const handleBuildArticle = useMemoizedFn((title: string) => {
    if (!selectedAnswer?.id) return;
    throttleHandleEditorContentChange.flush();

    buildArticleFromContent(selectedAnswer.id, title).then(article => {
      if (article) {
        setIsArticle(true);
        defaultArticleEventBus.createEditor().publishArticleEvent("article:created", article);
        message.success("创建文章成功");
        setDropdownOpen(false);
        void reloadContentStatus();
        onAnswerChange?.(selectedAnswer);
      } else {
        message.error("创建文章失败");
      }
    });
  });

  const handleCreateTreeItem = useMemoizedFn((mode: "project" | "document", title: string) => {
    if (!selectedAnswer?.id) return;
    throttleHandleEditorContentChange.flush();
    setDropdownOpen(false);
    useExtNoteInsertStore.getState().openModal({
      mode,
      sourceContentId: selectedAnswer.id,
      title,
      insertMode: "shared-content",
      onSuccess: () => {
        void reloadContentStatus();
        onAnswerChange?.(selectedAnswer);
      },
    });
  });

  const icon = (
    <svg
      className="h-5 w-5 text-blue-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
    </svg>
  );

  const showNavigation =
    typeof currentIndex === "number" && currentIndex >= 0 && typeof total === "number" && total > 1;

  const handleOpenTitleModal = useMemoizedFn((target: "article" | "project" | "document") => {
    setDropdownOpen(false);
    setTitleModalTarget(target);
  });

  const handleConfirmTitle = useMemoizedFn(({ title }: { title: string }) => {
    const target = titleModalTarget;
    setTitleModalTarget(null);
    if (!target) return;

    if (target === "article") {
      handleBuildArticle(title);
      return;
    }

    handleCreateTreeItem(target === "project" ? "project" : "document", title);
  });

  // 当没有选中的答案时，不渲染 Modal 内容
  if (!selectedAnswer) {
    return (
      <CustomModal
        open={visible}
        onCancel={onClose}
        width={800}
        title={customTitle}
        icon={icon}
        iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-[var(--th-border-focus)]/30"
        closeOnEscape={false}
        className="answer-modal"
        footer={null}
      >
        <div style={{ height: "70vh" }} />
      </CustomModal>
    );
  }

  return (
    <CustomModal
      open={visible}
      onCancel={onClose}
      width={800}
      title={customTitle}
      icon={icon}
      iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-[var(--th-border-focus)]/30"
      closeOnEscape={false}
      footer={null}
      bodyClassName="overflow-hidden"
      contentStyle={{ height: "80vh", maxHeight: "80vh" }}
    >
      <div className="flex h-full flex-col">
        {/* Metadata and actions */}
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-gray-200 pb-3 dark:border-slate-800">
          <div className="flex gap-2.5 text-xs text-gray-500 dark:text-gray-400">
            {currentContent && (
              <>
                <div>
                  <span>创建于 {formatDate(selectedAnswer.createTime, true)}</span>
                </div>
                <div>
                  <span>最后修改于 {formatDate(selectedAnswer.updateTime, true)}</span>
                </div>
                <div>字数：{getContentLength(currentContent)}</div>
              </>
            )}
          </div>

          <div className="ml-4 flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
                创建为
              </button>
              {dropdownOpen && (
                <>
                  <div className="z-9998 fixed inset-0" onClick={() => setDropdownOpen(false)} />
                  <div className="z-9999 absolute right-0 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-zinc-900">
                    {!isCard && (
                      <button
                        onClick={handleBuildCard}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-zinc-800"
                      >
                        <BsCardText className="h-4 w-4" />
                        创建卡片
                      </button>
                    )}
                    {!isArticle && (
                      <button
                        onClick={() => handleOpenTitleModal("article")}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-zinc-800"
                      >
                        <FileTextOutlined className="h-4 w-4" />
                        创建文章
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenTitleModal("project")}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-zinc-800"
                    >
                      <FolderOpenOutlined className="h-4 w-4" />
                      创建项目文档
                    </button>
                    <button
                      onClick={() => handleOpenTitleModal("document")}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-zinc-800"
                    >
                      <BookOutlined className="h-4 w-4" />
                      创建知识库文档
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {showNavigation && (
            <>
              <button
                className="absolute left-0 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center px-3 py-2 text-2xl text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
                onClick={() => {
                  if (!onPrev) return;
                  setDirection(-1);
                  onPrev();
                }}
              >
                <LeftOutlined />
              </button>
              <button
                className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center px-3 py-2 text-2xl text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
                onClick={() => {
                  if (!onNext) return;
                  setDirection(1);
                  onNext();
                }}
              >
                <RightOutlined />
              </button>
            </>
          )}
          <div className="min-h-full">
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={selectedAnswer.id}
                custom={direction}
                initial={{ x: direction >= 0 ? 40 : -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction >= 0 ? -40 : 40, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Editor
                  contentId={selectedAnswer?.id}
                  key={`answer-${selectedAnswer.id}`}
                  className="p-5"
                  ref={editorRef}
                  readonly={readOnly}
                  initValue={selectedAnswer.content}
                  extensions={extensions}
                  onChange={handleAnswerContentChange}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
      <EditTitleModal
        open={titleModalTarget !== null}
        onCancel={() => setTitleModalTarget(null)}
        onConfirm={handleConfirmTitle}
        initialTitle={defaultProjectionTitle()}
        modalTitle={
          titleModalTarget === "article"
            ? "创建文章"
            : titleModalTarget === "project"
              ? "创建项目文档"
              : "创建知识库文档"
        }
        modalDescription={
          titleModalTarget === "article"
            ? "请输入文章标题"
            : titleModalTarget === "project"
              ? "请输入项目文档标题"
              : "请输入知识库文档标题"
        }
        placeholder={
          titleModalTarget === "article"
            ? "请输入文章标题"
            : titleModalTarget === "project"
              ? "请输入项目文档标题"
              : "请输入知识库文档标题"
        }
      />
    </CustomModal>
  );
};

export default AnswerModal;
