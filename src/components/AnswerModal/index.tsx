import React, { useRef, useEffect, useState, useMemo } from "react";
import { Modal, App, Dropdown, MenuItemProps, Button } from "antd";
import classnames from "classnames";
import { motion, AnimatePresence } from "framer-motion";
import { IAnswer } from "@/types";
import Editor, { IExtension, EditorRef } from "@/components/Editor";
import styles from "./index.module.less";
import { Descendant } from "slate";
import { useMemoizedFn, useUnmount } from "ahooks";
import useEditContent from "@/hooks/useEditContent";
import { isContentIsCard, buildCardFromContent } from "@/commands/card";
import { BsCardText } from "react-icons/bs";
import { defaultCardEventBus, getContentLength } from "@/utils";
import { formatDate } from "@/utils";
import { MoreOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";

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
  const { throttleHandleEditorContentChange } = useEditContent(
    selectedAnswer?.id,
    (data) => {
      editorRef.current?.setEditorValue(data);
    },
  );

  const handleAnswerContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!selectedAnswer) {
      return;
    }
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
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    if (selectedAnswer?.id && visible) {
      isContentIsCard(selectedAnswer.id).then((res) => {
        setIsCard(res);
      });
    }
  }, [selectedAnswer?.id, visible]);

  const handleBuildCard: MenuItemProps["onClick"] = useMemoizedFn(() => {
    if (!selectedAnswer?.id) return;

    buildCardFromContent(selectedAnswer.id).then((card) => {
      if (card) {
        setIsCard(true);
        defaultCardEventBus
          .createEditor()
          .publishCardEvent("card:created", card);
        message.success("创建卡片成功");
      } else {
        message.error("创建卡片失败");
      }
    });
  });

  const items = useMemo(() => {
    return [
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

  const showNavigation =
    typeof currentIndex === "number" &&
    currentIndex >= 0 &&
    typeof total === "number" &&
    total > 1;

  if (!selectedAnswer) return null;

  const content = selectedAnswer.content;

  return (
    <Modal
      title={customTitle}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
      keyboard={false}
      styles={{
        body: {
          height: "70vh",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex text-xs gap-2.5 text-gray-500 dark:text-gray-300">
          {content && (
            <>
              <div>
                <span>
                  创建于 {formatDate(selectedAnswer.createTime, true)}
                </span>
              </div>
              <div>
                <span>
                  最后修改于 {formatDate(selectedAnswer.updateTime, true)}
                </span>
              </div>
              <div>字数：{getContentLength(content)}</div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4">
          {items.length > 0 && (
            <Dropdown menu={{ items }}>
              <Button type="text" icon={<MoreOutlined />} />
            </Dropdown>
          )}
        </div>
      </div>
      <div className={classnames(styles.answerEditor)}>
        {showNavigation && (
          <>
            <button
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 px-3 py-2 flex items-center justify-center text-2xl text-gray-400 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
              onClick={() => {
                if (!onPrev) return;
                setDirection(-1);
                onPrev();
              }}
            >
              <LeftOutlined />
            </button>
            <button
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 px-3 py-2 flex items-center justify-center text-2xl text-gray-400 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
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
                style={{ padding: 20 }}
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
    </Modal>
  );
};

export default AnswerModal;
