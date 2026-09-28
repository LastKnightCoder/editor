import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  MoreVertical,
  StickyNote,
} from "lucide-react";
import { Button, Dialog, DialogBody, IconButton, Input, Menu, toast } from "@tau/ui";
import { IAnswer } from "@/types";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import { Descendant } from "slate";
import { useMemoizedFn, useUnmount } from "ahooks";
import useEditContent from "@/hooks/useEditContent";
import { buildCardFromContent } from "@/commands/card";
import { buildArticleFromContent } from "@/commands/article";
import { defaultCardEventBus, getContentLength } from "@/utils";
import { formatDate } from "@/utils";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { getAnswerContentStatus } from "@/utils/answer-content";
import useExtNoteInsertStore from "@/stores/useExtNoteInsertStore";
import { getEditorText } from "@/utils/editor";

interface AnswerModalProps {
  visible: boolean;
  selectedAnswer: IAnswer | null;
  onClose: () => void;
  onAnswerChange?: (answer: IAnswer) => void;
  readOnly?: boolean;
  customTitle?: string;
  currentIndex?: number;
  total?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

const ICON = { size: 14, strokeWidth: 1.75 } as const;

const AnswerModal: React.FC<AnswerModalProps> = ({
  visible,
  selectedAnswer,
  onClose,
  onAnswerChange,
  readOnly = false,
  customTitle = "答案详情",
  currentIndex,
  total,
  onPrev,
  onNext,
}) => {
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
  const [titleModalTarget, setTitleModalTarget] = useState<"article" | "project" | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

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
        toast.success("创建卡片成功");
        void reloadContentStatus();
        // 通知父组件刷新答案类型
        onAnswerChange?.(selectedAnswer);
      } else {
        toast.error("创建卡片失败");
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
        toast.success("创建文章成功");
        void reloadContentStatus();
        onAnswerChange?.(selectedAnswer);
      } else {
        toast.error("创建文章失败");
      }
    });
  });

  const handleCreateTreeItem = useMemoizedFn((mode: "project", title: string) => {
    if (!selectedAnswer?.id) return;
    throttleHandleEditorContentChange.flush();
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

  const showNavigation =
    typeof currentIndex === "number" && currentIndex >= 0 && typeof total === "number" && total > 1;

  const handleOpenTitleModal = useMemoizedFn((target: "article" | "project") => {
    setDraftTitle(defaultProjectionTitle());
    setTitleModalTarget(target);
  });

  const handleConfirmTitle = useMemoizedFn(() => {
    const target = titleModalTarget;
    const title = draftTitle.trim();
    if (!target) return;
    if (!title) {
      toast.warning(target === "article" ? "请输入文章标题" : "请输入项目文档标题");
      return;
    }
    setTitleModalTarget(null);

    if (target === "article") {
      handleBuildArticle(title);
      return;
    }

    handleCreateTreeItem("project", title);
  });

  // 编辑器内 Esc 常用于收起浮层，不作为关闭弹窗的手势（沿用原 closeOnEscape=false）
  const swallowEscape = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const titleTargetLabel = titleModalTarget === "article" ? "文章" : "项目文档";

  return (
    <Dialog
      open={visible}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={customTitle}
      icon={<FileText size={16} strokeWidth={1.75} />}
      width={800}
      height={760}
      onKeyDown={swallowEscape}
      className="answer-modal"
    >
      <div className="border-line-2 mt-[14px] flex min-h-0 flex-1 flex-col overflow-hidden border-t">
        {selectedAnswer && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* 元信息与操作 */}
            <div className="flex shrink-0 items-center justify-between gap-4 px-6 py-2.5">
              <div className="text-tau-sm text-ink-3 flex min-w-0 flex-wrap gap-x-3 gap-y-1 tabular-nums">
                {currentContent && (
                  <>
                    <span>创建于 {formatDate(selectedAnswer.createTime, true)}</span>
                    <span>最后修改于 {formatDate(selectedAnswer.updateTime, true)}</span>
                    <span>字数 {getContentLength(currentContent)}</span>
                  </>
                )}
              </div>

              <Menu
                align="end"
                trigger={
                  <Button size="sm" variant="secondary" icon={MoreVertical}>
                    创建为
                  </Button>
                }
              >
                {!isCard && (
                  <Menu.Item icon={<StickyNote {...ICON} />} onSelect={handleBuildCard}>
                    创建卡片
                  </Menu.Item>
                )}
                {!isArticle && (
                  <Menu.Item
                    icon={<FileText {...ICON} />}
                    onSelect={() => handleOpenTitleModal("article")}
                  >
                    创建文章
                  </Menu.Item>
                )}
                <Menu.Item
                  icon={<FolderOpen {...ICON} />}
                  onSelect={() => handleOpenTitleModal("project")}
                >
                  创建项目文档
                </Menu.Item>
              </Menu>
            </div>

            <div className="relative min-h-0 flex-1">
              {showNavigation && (
                <>
                  <IconButton
                    aria-label="上一个"
                    className="text-ink-3 absolute left-2 top-1/2 z-10 -translate-y-1/2"
                    onClick={() => {
                      if (!onPrev) return;
                      setDirection(-1);
                      onPrev();
                    }}
                  >
                    <ChevronLeft size={18} strokeWidth={1.75} />
                  </IconButton>
                  <IconButton
                    aria-label="下一个"
                    className="text-ink-3 absolute right-2 top-1/2 z-10 -translate-y-1/2"
                    onClick={() => {
                      if (!onNext) return;
                      setDirection(1);
                      onNext();
                    }}
                  >
                    <ChevronRight size={18} strokeWidth={1.75} />
                  </IconButton>
                </>
              )}
              <div className="h-full overflow-y-auto overflow-x-hidden">
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
                      className={showNavigation ? "px-12 py-5" : "px-6 py-5"}
                      ref={editorRef}
                      readonly={readOnly}
                      initValue={selectedAnswer.content}
                      onChange={handleAnswerContentChange}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}

        <Dialog
          open={titleModalTarget !== null}
          onOpenChange={open => {
            if (!open) setTitleModalTarget(null);
          }}
          title={`创建${titleTargetLabel}`}
          subtitle={`请输入${titleTargetLabel}标题`}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setTitleModalTarget(null)}>
                取消
              </Button>
              <Button variant="primary" onClick={handleConfirmTitle}>
                确定
              </Button>
            </>
          }
        >
          <DialogBody>
            <Input
              data-autofocus
              placeholder={`请输入${titleTargetLabel}标题`}
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleConfirmTitle();
                }
              }}
            />
          </DialogBody>
        </Dialog>
      </div>
    </Dialog>
  );
};

export default AnswerModal;
