import React, { useRef, useEffect, useState, useMemo } from "react";
import { Card, App, Dropdown, MenuItemProps } from "antd";
import { useMemoizedFn } from "ahooks";

import { DeleteOutlined, MoreOutlined } from "@ant-design/icons";
import { BsCardText } from "react-icons/bs";
import { IAnswer } from "@/types";

import Editor, { EditorRef } from "@/components/Editor";
import useEditContent from "@/hooks/useEditContent";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";
import { isContentIsCard, buildCardFromContent } from "@/commands/card";

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

  const editorRef = useRef<EditorRef>(null);
  const extensions = useDynamicExtensions();
  const [isCard, setIsCard] = useState(false);

  useEffect(() => {
    if (contentId) {
      isContentIsCard(contentId).then((res) => {
        setIsCard(res);
      });
    }
  }, [contentId]);

  useEditContent(contentId, (data) => {
    editorRef.current?.setEditorValue(data.slice(0, 3));
  });

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

  const handleBuildCard: MenuItemProps["onClick"] = useMemoizedFn(() => {
    if (!contentId) return;

    buildCardFromContent(contentId).then((card) => {
      if (card) {
        setIsCard(true);
        message.success("创建卡片成功");
      } else {
        message.error("创建卡片失败");
      }
    });
  });

  const handleClick = useMemoizedFn(() => {
    if (onViewAnswer) {
      onViewAnswer(answer.id);
    }
  });

  const items = useMemo(() => {
    return [
      !readOnly
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
    ].filter((val) => val !== null);
  }, [isCard]);

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
          initValue={answer.content.slice(0, 3)}
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
    </Card>
  );
};

export default AnswerCard;
