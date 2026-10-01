import React, { useEffect, useState } from "react";
import { ConfirmDialog, Menu, Panel, toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";

import { MoreHorizontal, FileText, FolderOpen, Trash2 } from "lucide-react";
import { BsCardText } from "react-icons/bs";
import { IAnswer } from "@/types";
import { defaultArticleEventBus, defaultCardEventBus } from "@/utils";
import Editor from "@/components/ContentEditor";
import { buildCardFromContent } from "@/commands/card";
import { buildArticleFromContent } from "@/commands/article";
import useExtNoteInsertStore from "@/stores/useExtNoteInsertStore";
import { getAnswerContentStatus } from "@/utils/answer-content";
import { getEditorText } from "@/utils/editor";
import EditTitleModal from "@/components/EditTitleModal";

const styles = {
  answerContent: "box-border max-h-[200px] overflow-y-hidden",
  editor: "",
  moreIcon: "absolute right-2 top-2 flex size-6 cursor-pointer items-center justify-center",
};

interface AnswerCardProps {
  answer: IAnswer;
  readOnly?: boolean;
  onDeleteAnswer?: (answerId: number) => void;
  onViewAnswer?: (answerId: number) => void;
  contentId?: number;
}

const AnswerCard: React.FC<AnswerCardProps> = ({
  answer,
  readOnly = false,
  onDeleteAnswer,
  onViewAnswer,
  contentId,
}) => {
  const [isCard, setIsCard] = useState(false);
  const [isArticle, setIsArticle] = useState(false);
  const [titleModalTarget, setTitleModalTarget] = useState<"article" | "project" | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [content, setContent] = useState(answer.content);

  useEffect(() => {
    if (contentId) {
      getAnswerContentStatus(contentId).then(status => {
        setIsCard(status.isCard);
        setIsArticle(status.isArticle);
      });
    }
  }, [contentId]);

  const reloadContentStatus = useMemoizedFn(async () => {
    if (!contentId) return;
    const status = await getAnswerContentStatus(contentId);
    setIsCard(status.isCard);
    setIsArticle(status.isArticle);
  });

  const handleBuildCard = useMemoizedFn(() => {
    if (!contentId) return;

    buildCardFromContent(contentId).then(card => {
      if (card) {
        setIsCard(true);
        defaultCardEventBus.createEditor().publishCardEvent("card:created", card);
        void reloadContentStatus();
        toast.success("创建卡片成功");
      } else {
        toast.error("创建卡片失败");
      }
    });
  });

  const defaultProjectionTitle = useMemoizedFn(() => {
    if (!contentId) return "";
    return getEditorText(content, 20) || `答案 #${contentId}`;
  });

  const handleBuildArticle = useMemoizedFn((title: string) => {
    if (!contentId) return;

    buildArticleFromContent(contentId, title).then(article => {
      if (article) {
        setIsArticle(true);
        defaultArticleEventBus.createEditor().publishArticleEvent("article:created", article);
        void reloadContentStatus();
        toast.success("创建文章成功");
      } else {
        toast.error("创建文章失败");
      }
    });
  });

  const handleCreateTreeItem = useMemoizedFn((mode: "project", title: string) => {
    if (!contentId) return;
    useExtNoteInsertStore.getState().openModal({
      mode,
      sourceContentId: contentId,
      title,
      insertMode: "shared-content",
      onSuccess: () => {
        void reloadContentStatus();
      },
    });
  });

  const handleOpenTitleModal = useMemoizedFn((target: "article" | "project") => {
    setTitleModalTarget(target);
  });

  const handleDeleteAnswer = useMemoizedFn(() => {
    if (!onDeleteAnswer) return;
    setDeleteConfirmOpen(true);
  });

  const handleConfirmDelete = useMemoizedFn(() => {
    onDeleteAnswer?.(answer.id);
    toast.success("删除成功");
  });

  const handleConfirmTitle = useMemoizedFn(({ title }: { title: string }) => {
    const target = titleModalTarget;
    setTitleModalTarget(null);
    if (!target) return;

    if (target === "article") {
      handleBuildArticle(title);
      return;
    }

    handleCreateTreeItem("project", title);
  });

  const handleClick = useMemoizedFn(() => {
    if (onViewAnswer) {
      onViewAnswer(answer.id);
    }
  });

  const hasMenuItems = Boolean(onDeleteAnswer) || !isCard || !isArticle;

  return (
    <Panel
      key={answer.id}
      className="relative"
      style={{
        cursor: onViewAnswer ? "pointer" : "default",
      }}
    >
      <div className={styles.answerContent} onClick={handleClick}>
        <Editor
          contentId={contentId}
          initValue={answer.content}
          onChange={setContent}
          readonly={readOnly}
          className={styles.editor}
        />
      </div>
      {hasMenuItems && (
        <Menu
          align="end"
          trigger={
            <div className={styles.moreIcon} onClick={e => e.stopPropagation()}>
              <MoreHorizontal size={14} />
            </div>
          }
        >
          {onDeleteAnswer && (
            <Menu.Item onSelect={handleDeleteAnswer} danger icon={<Trash2 size={14} />}>
              删除答案
            </Menu.Item>
          )}
          {!isCard && (
            <Menu.Item onSelect={handleBuildCard} icon={<BsCardText />}>
              创建卡片
            </Menu.Item>
          )}
          {!isArticle && (
            <Menu.Item
              onSelect={() => handleOpenTitleModal("article")}
              icon={<FileText size={14} />}
            >
              创建文章
            </Menu.Item>
          )}
          <Menu.Item
            onSelect={() => handleOpenTitleModal("project")}
            icon={<FolderOpen size={14} />}
          >
            创建项目文档
          </Menu.Item>
        </Menu>
      )}
      <EditTitleModal
        open={titleModalTarget !== null}
        onCancel={() => setTitleModalTarget(null)}
        onConfirm={handleConfirmTitle}
        initialTitle={defaultProjectionTitle()}
        modalTitle={titleModalTarget === "article" ? "创建文章" : "创建项目文档"}
        modalDescription={titleModalTarget === "article" ? "请输入文章标题" : "请输入项目文档标题"}
        placeholder={titleModalTarget === "article" ? "请输入文章标题" : "请输入项目文档标题"}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="删除答案"
        description="确定删除该答案吗？"
        danger
        confirmText="删除"
        onConfirm={handleConfirmDelete}
      />
    </Panel>
  );
};

export default AnswerCard;
