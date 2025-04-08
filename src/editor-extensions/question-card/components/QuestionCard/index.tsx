import React, { useState, useRef, useEffect } from "react";
import { Transforms, Descendant } from "slate";
import { ReactEditor, useSlate, useReadOnly } from "slate-react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import { IExtensionBaseProps } from "@editor/extensions/types.ts";
import { QuestionElement } from "@/editor-extensions/question-card";
import ContentSelectorModal from "@/components/ContentSelectorModal";

import {
  getQuestionById,
  getQuestionAnswers,
  createAnswer,
  addAnswer,
  deleteAnswer,
  updateQuestion,
} from "@/commands/question";
import useGridLayout from "@/hooks/useGridLayout";
import { IExtension } from "@/components/Editor";
import { IAnswer, SearchResult } from "@/types";
import EditText, { EditTextHandle } from "@/components/EditText";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop";
import useTheme from "@/components/Editor/hooks/useTheme";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import AnswerCard from "./AnswerCard";
import AnswerModal from "./AnswerModal";
import NewAnswerModal from "./NewAnswerModal";

import styles from "./index.module.less";
import { PlusOutlined } from "@ant-design/icons";
import { MenuProps, Dropdown } from "antd";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const QuestionCard: React.FC<IExtensionBaseProps<QuestionElement>> = (
  props,
) => {
  const { attributes, element, children } = props;
  const editor = useSlate();
  const readOnly = useReadOnly();
  const [realTitle, setRealTitle] = useState<string>(element.title);
  const titleRef = useRef<EditTextHandle>(null);
  const [answers, setAnswers] = useState<IAnswer[]>([]);
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [contentSelectorVisible, setContentSelectorVisible] = useState(false);
  const [newAnswerModalVisible, setNewAnswerModalVisible] = useState(false);
  const [newAnswerContent, setNewAnswerContent] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const [extensions, setExtensions] = useState<IExtension[]>([]);
  const [excludeContentIds, setExcludeContentIds] = useState<number[]>([]);

  const { questionId } = element;

  const { isDark } = useTheme();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      // @ts-ignore
      element,
    });

  const { gridContainerRef, itemWidth, gap } = useGridLayout({
    minWidth: 280,
    maxWidth: 350,
    gap: 24,
  });

  useEffect(() => {
    import("@/editor-extensions").then((modules) => {
      const {
        cardLinkExtension,
        fileAttachmentExtension,
        documentCardListExtension,
        projectCardListExtension,
        questionCardExtension,
      } = modules;
      setExtensions([
        cardLinkExtension,
        fileAttachmentExtension,
        documentCardListExtension,
        projectCardListExtension,
        questionCardExtension,
      ]);
    });
  }, []);

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
        // console.log("answersData", answersData);
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

  // 处理创建新答案
  const handleCreateNewAnswer = useMemoizedFn(async () => {
    try {
      if (!newAnswerContent || newAnswerContent.length === 0) {
        return;
      }

      const answer = await createAnswer(newAnswerContent);
      await addAnswer(questionId, {
        contentId: answer.id,
        content: answer.content,
      });
      fetchQuestion();
      setNewAnswerModalVisible(false);
      setNewAnswerContent(DEFAULT_CONTENT);
    } catch (error) {
      console.error("创建新答案失败:", error);
    }
  });

  // 处理新答案内容变化
  const handleNewAnswerChange = useMemoizedFn((value: Descendant[]) => {
    setNewAnswerContent(value);
  });

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
            <div
              className={styles.answersContainer}
              style={{ gap }}
              ref={gridContainerRef}
            >
              <>
                {answers.map((answer) => (
                  <AnswerCard
                    key={answer.id}
                    answer={answer}
                    itemWidth={itemWidth}
                    readOnly={readOnly}
                    onDeleteAnswer={handleDeleteAnswer}
                    onViewAnswer={handleViewAnswer}
                  />
                ))}
              </>
            </div>
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
        contentType={["card", "article", "project-item", "document-item"]}
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
        defaultContent={DEFAULT_CONTENT}
        extensions={extensions}
        onCancel={() => {
          setNewAnswerModalVisible(false);
          setNewAnswerContent(DEFAULT_CONTENT);
        }}
        onOk={handleCreateNewAnswer}
        onChange={handleNewAnswerChange}
      />
    </div>
  );
};

export default QuestionCard;
