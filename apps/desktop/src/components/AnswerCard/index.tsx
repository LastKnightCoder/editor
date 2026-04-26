import React, { useRef, useEffect, useState, useMemo } from "react";
import { Card, App, Dropdown, MenuItemProps } from "antd";
import { useMemoizedFn } from "ahooks";

import {
  DeleteOutlined,
  MoreOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { BsCardText } from "react-icons/bs";
import { IAnswer } from "@/types";
import { defaultArticleEventBus, defaultCardEventBus } from "@/utils";
import { Editor, EditorRef } from "@tau/editor/src";
import useEditContent from "@/hooks/useEditContent";
import { buildCardFromContent } from "@/commands/card";
import { buildArticleFromContent } from "@/commands/article";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useExtNoteInsertStore from "@/stores/useExtNoteInsertStore";
import { getAnswerContentStatus } from "@/utils/answer-content";
import { getEditorText } from "@/utils/editor";
import EditTitleModal from "@/components/EditTitleModal";

import styles from "./index.module.less";

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
  const { modal, message } = App.useApp();
  const extensions = useDynamicExtensionsStore((state) => state.extensions);
  const editorRef = useRef<EditorRef>(null);
  const [isCard, setIsCard] = useState(false);
  const [isArticle, setIsArticle] = useState(false);
  const [titleModalTarget, setTitleModalTarget] = useState<
    "article" | "project" | "document" | null
  >(null);

  useEffect(() => {
    if (contentId) {
      getAnswerContentStatus(contentId).then((status) => {
        setIsCard(status.isCard);
        setIsArticle(status.isArticle);
      });
    }
  }, [contentId]);

  const { content, throttleHandleEditorContentChange } = useEditContent(
    contentId,
    (data) => {
      editorRef.current?.setEditorValue(data);
    },
  );

  const reloadContentStatus = useMemoizedFn(async () => {
    if (!contentId) return;
    const status = await getAnswerContentStatus(contentId);
    setIsCard(status.isCard);
    setIsArticle(status.isArticle);
  });

  const handleBuildCard: MenuItemProps["onClick"] = useMemoizedFn(() => {
    if (!contentId) return;
    throttleHandleEditorContentChange.flush();

    buildCardFromContent(contentId).then((card) => {
      if (card) {
        setIsCard(true);
        defaultCardEventBus
          .createEditor()
          .publishCardEvent("card:created", card);
        void reloadContentStatus();
        message.success("创建卡片成功");
      } else {
        message.error("创建卡片失败");
      }
    });
  });

  const defaultProjectionTitle = useMemoizedFn(() => {
    if (!contentId) return "";
    return getEditorText(content, 20) || `答案 #${contentId}`;
  });

  const handleBuildArticle = useMemoizedFn((title: string) => {
    if (!contentId) return;
    throttleHandleEditorContentChange.flush();

    buildArticleFromContent(contentId, title).then((article) => {
      if (article) {
        setIsArticle(true);
        defaultArticleEventBus
          .createEditor()
          .publishArticleEvent("article:created", article);
        void reloadContentStatus();
        message.success("创建文章成功");
      } else {
        message.error("创建文章失败");
      }
    });
  });

  const handleCreateTreeItem = useMemoizedFn(
    (mode: "project" | "document", title: string) => {
      if (!contentId) return;
      throttleHandleEditorContentChange.flush();
      useExtNoteInsertStore.getState().openModal({
        mode,
        sourceContentId: contentId,
        title,
        insertMode: "shared-content",
        onSuccess: () => {
          void reloadContentStatus();
        },
      });
    },
  );

  const handleOpenTitleModal = useMemoizedFn(
    (target: "article" | "project" | "document") => {
      setTitleModalTarget(target);
    },
  );

  const handleDeleteAnswer: MenuItemProps["onClick"] = useMemoizedFn(() => {
    if (!onDeleteAnswer) return;

    modal.confirm({
      title: "删除答案",
      content: "确定删除该答案吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: () => {
        onDeleteAnswer(answer.id);
        message.success("删除成功");
      },
    });
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

  const items = useMemo(() => {
    return [
      onDeleteAnswer
        ? {
            key: "delete",
            label: "删除答案",
            icon: <DeleteOutlined />,
            onClick: handleDeleteAnswer,
          }
        : null,
      !isCard
        ? {
            key: "build-card",
            label: "创建卡片",
            icon: <BsCardText />,
            onClick: handleBuildCard,
          }
        : null,
      !isArticle
        ? {
            key: "build-article",
            label: "创建文章",
            icon: <FileTextOutlined />,
            onClick: () => handleOpenTitleModal("article"),
          }
        : null,
      {
        key: "build-project-item",
        label: "创建项目文档",
        icon: <FolderOpenOutlined />,
        onClick: () => handleOpenTitleModal("project"),
      },
      {
        key: "build-document-item",
        label: "创建知识库文档",
        icon: <BookOutlined />,
        onClick: () => handleOpenTitleModal("document"),
      },
    ].filter((val) => val !== null);
  }, [
    handleBuildCard,
    handleDeleteAnswer,
    handleOpenTitleModal,
    isArticle,
    isCard,
    onDeleteAnswer,
  ]);

  const handleClick = useMemoizedFn(() => {
    if (onViewAnswer) {
      onViewAnswer(answer.id);
    }
  });

  return (
    <Card
      key={answer.id}
      style={{
        boxSizing: "border-box",
        position: "relative",
        cursor: onViewAnswer ? "pointer" : "default",
      }}
    >
      <div className={styles.answerContent} onClick={handleClick}>
        <Editor
          ref={editorRef}
          initValue={answer.content}
          readonly={readOnly}
          extensions={extensions}
          className={styles.editor}
        />
      </div>
      {items.length > 0 && (
        <Dropdown
          menu={{
            items,
          }}
        >
          <div className={styles.moreIcon} onClick={(e) => e.stopPropagation()}>
            <MoreOutlined />
          </div>
        </Dropdown>
      )}
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
    </Card>
  );
};

export default AnswerCard;
