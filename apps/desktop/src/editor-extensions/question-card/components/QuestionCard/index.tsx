import React, { useState, useRef, useEffect } from "react";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import { IExtensionBaseProps } from "@tau/editor/src";
import { QuestionElement } from "@/editor-extensions/question-card";
import ContentSelectorModal from "@/components/ContentSelectorModal";

import {
  getQuestionById,
  getQuestionAnswers,
  addAnswer,
  deleteAnswer,
  updateQuestion,
} from "@/commands/question";
import { IAnswer, SearchResult } from "@/types";
import EditText, { EditTextHandle } from "@/components/EditText";
import { useDragAndDrop } from "@tau/editor/src";
import { useTheme } from "@tau/editor/src";
import { AddParagraph } from "@tau/editor/src";

import AnswerCardList from "@/components/AnswerCardList";
import AnswerModal from "@/components/AnswerModal";
import NewAnswerModal from "@/components/NewAnswerModal";

import styles from "./index.module.less";
import { PlusOutlined } from "@ant-design/icons";
import { MenuProps, Dropdown } from "antd";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

const QuestionCard: React.FC<IExtensionBaseProps<QuestionElement>> = (
  props,
) => {
  const { attributes, element, children } = props;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [realTitle, setRealTitle] = useState<string>(element.title);
  const titleRef = useRef<EditTextHandle>(null);
  const [answers, setAnswers] = useState<IAnswer[]>([]);
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [contentSelectorVisible, setContentSelectorVisible] = useState(false);
  const [newAnswerModalVisible, setNewAnswerModalVisible] = useState(false);
  const [excludeContentIds, setExcludeContentIds] = useState<number[]>([]);
  const extensions = useDynamicExtensionsStore((state) => state.extensions);
  const { questionId } = element;

  const { isDark } = useTheme();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      // @ts-ignore
      element,
    });

  // 获取问题和答案
  const fetchQuestion = useMemoizedFn(async () => {
    try {
      const questionData = await getQuestionById(questionId);
      if (!questionData) {
        return;
      }
      setRealTitle(questionData.questionContent);
      titleRef.current?.setValue(questionData.questionContent);

      if (questionData.answers && questionData.answers.length > 0) {
        const answersData = await getQuestionAnswers(questionId);
        setAnswers(answersData || []);
        setExcludeContentIds(questionData.answers);
      } else {
        setAnswers([]);
      }
    } catch (error) {
      console.error("获取问题失败:", error);
    }
  });

  useEffect(() => {
    fetchQuestion();
  }, [questionId]);

  const { run: handleTitleChange } = useThrottleFn(
    async (value: string) => {
      setRealTitle(value);
      const path = ReactEditor.findPath(editor, element as any);
      Transforms.setNodes(editor, { title: value }, { at: path });
      await updateQuestion(questionId, value);
    },
    { wait: 1000 },
  );

  // 处理删除答案
  const handleDeleteAnswer = useMemoizedFn(async (answerId: number) => {
    try {
      await deleteAnswer(questionId, answerId);
      fetchQuestion();
    } catch (error) {
      console.error("删除答案失败:", error);
    }
  });

  // 处理添加答案
  const handleAddAnswer = useMemoizedFn(
    async (item: SearchResult | SearchResult[]) => {
      try {
        if (Array.isArray(item)) {
          item.forEach(async (item) => {
            await addAnswer(
              questionId,
              {
                contentId: item.contentId,
                content: item.content,
              },
              true,
            );
          });
        } else {
          await addAnswer(
            questionId,
            {
              contentId: item.contentId,
              content: item.content,
            },
            true,
          );
        }
      } catch (error) {
        console.error("添加答案失败:", error);
      }
      fetchQuestion();
      setContentSelectorVisible(false);
    },
  );

  // 处理查看答案详情
  const handleViewAnswer = useMemoizedFn((answerId: number) => {
    setSelectedAnswerId(answerId);
    setModalVisible(true);
  });

  const handleAnswerChange = useMemoizedFn((answer: IAnswer) => {
    setAnswers(answers.map((a) => (a.id === answer.id ? answer : a)));
  });

  const addMenu: MenuProps = {
    items: [
      {
        key: "new",
        label: "写答案",
        onClick: () => setNewAnswerModalVisible(true),
      },
      {
        key: "select",
        label: "选择答案",
        onClick: () => setContentSelectorVisible(true),
      },
    ],
  };

  const selectedAnswer = selectedAnswerId
    ? answers.find((a) => a.id === selectedAnswerId) || null
    : null;

  return (
    <div ref={drop} className={styles.container}>
      <div {...attributes}>
        <div
          className={classnames(styles.questionCard, {
            [styles.dragging]: isDragging,
            [styles.drop]: isOverCurrent && canDrop,
            [styles.before]: isBefore,
            [styles.after]: !isBefore,
            [styles.dark]: isDark,
          })}
        >
          <div contentEditable={false} style={{ userSelect: "none" }}>
            <div
              className={classnames(styles.header, {
                [styles.dark]: isDark,
              })}
            >
              <div className={styles.titleContainer}>
                <div className={styles.titleLabel}>问题：</div>
                <EditText
                  defaultValue={realTitle}
                  isSlateEditor
                  ref={titleRef}
                  onChange={handleTitleChange}
                  className={classnames(styles.title, {
                    [styles.dark]: isDark,
                  })}
                  contentEditable={!readOnly}
                />
              </div>
              {!readOnly && (
                <div className={styles.addButton}>
                  <Dropdown
                    menu={addMenu}
                    trigger={["hover"]}
                    placement="bottomRight"
                  >
                    <PlusOutlined className={styles.plusIcon} />
                  </Dropdown>
                </div>
              )}
            </div>

            <AnswerCardList
              answers={answers}
              readOnly={readOnly}
              onDeleteAnswer={handleDeleteAnswer}
              onViewAnswer={handleViewAnswer}
            />
          </div>
          {children}
        </div>

        <AddParagraph element={element as any} />

        {!readOnly && (
          <div
            contentEditable={false}
            ref={drag}
            className={classnames(styles.dragHandler, {
              [styles.canDrag]: canDrag,
            })}
          >
            <MdDragIndicator
              className={classnames(styles.icon, {
                [styles.dark]: isDark,
              })}
            />
          </div>
        )}
      </div>

      <ContentSelectorModal
        open={contentSelectorVisible}
        onCancel={() => setContentSelectorVisible(false)}
        onSelect={handleAddAnswer}
        contentType={[
          "card",
          "article",
          "project-item",
          "document-item",
          "diary-daily",
          "diary-weekly",
          "diary-monthly",
        ]}
        extensions={extensions}
        excludeContentIds={excludeContentIds}
      />

      <AnswerModal
        visible={modalVisible}
        selectedAnswer={selectedAnswer}
        extensions={extensions}
        onClose={() => setModalVisible(false)}
        onAnswerChange={handleAnswerChange}
        readOnly={readOnly}
      />

      <NewAnswerModal
        visible={newAnswerModalVisible}
        questionId={questionId}
        extensions={extensions}
        onClose={() => {
          setNewAnswerModalVisible(false);
          fetchQuestion();
        }}
      />
    </div>
  );
};

export default QuestionCard;
