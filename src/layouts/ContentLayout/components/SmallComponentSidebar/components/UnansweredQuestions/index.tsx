import React, { useEffect, useState } from "react";
import {
  Button,
  List,
  Typography,
  Modal,
  Dropdown,
  MenuProps,
  Flex,
  Input,
  App,
} from "antd";
import {
  LoadingOutlined,
  SyncOutlined,
  PlusOutlined,
  RightOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { IQuestion, IAnswer } from "@/types";
import {
  getNoAnswerQuestions,
  getQuestionAnswers,
  createAnswer,
  addAnswer,
  deleteAnswer,
  updateQuestion,
  createQuestion,
  deleteQuestion,
} from "@/commands/question";
import EditText from "@/components/EditText";
import AnswerCardList from "@/components/AnswerCardList";
import NewAnswerModal from "@/components/NewAnswerModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { Descendant } from "slate";
import { SearchResult } from "@/types";
import AnswerModal from "@/components/AnswerModal";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";

import styles from "./index.module.less";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const UnansweredQuestions: React.FC = () => {
  const [questions, setQuestions] = useState<IQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<IQuestion | null>(
    null,
  );
  const [selectedQuestionAnswers, setSelectedQuestionAnswers] = useState<
    IAnswer[]
  >([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newAnswerModalVisible, setNewAnswerModalVisible] = useState(false);
  const [contentSelectorVisible, setContentSelectorVisible] = useState(false);
  const [newAnswerContent, setNewAnswerContent] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const [excludeContentIds, setExcludeContentIds] = useState<number[]>([]);
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const [answerPreviewVisible, setAnswerPreviewVisible] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [newQuestionModalVisible, setNewQuestionModalVisible] = useState(false);
  const [newQuestionContent, setNewQuestionContent] = useState("");

  const { message, modal } = App.useApp();
  const extensions = useDynamicExtensions();

  const fetchQuestions = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const unansweredQuestions = await getNoAnswerQuestions();
      setQuestions(unansweredQuestions);
    } catch (error) {
      console.error("获取未回答问题失败:", error);
    } finally {
      setLoading(false);
    }
  });

  const handleRefresh = useMemoizedFn(async () => {
    if (refreshing || loading) return;

    setRefreshing(true);
    try {
      await fetchQuestions();
    } finally {
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
    }
  });

  const handleQuestionClick = useMemoizedFn(async (question: IQuestion) => {
    setSelectedQuestion(question);

    try {
      const answers = await getQuestionAnswers(question.id);
      setSelectedQuestionAnswers(answers);
      setExcludeContentIds(question.answers || []);
    } catch (error) {
      console.error("获取问题答案失败:", error);
      setSelectedQuestionAnswers([]);
    }

    setModalVisible(true);
  });

  const handleCloseModal = useMemoizedFn(() => {
    setModalVisible(false);
    setSelectedQuestion(null);
    setSelectedQuestionAnswers([]);
  });

  // 处理删除答案
  const handleDeleteAnswer = useMemoizedFn(async (answerId: number) => {
    if (!selectedQuestion) return;
    try {
      await deleteAnswer(selectedQuestion.id, answerId);
      // 重新获取问题答案
      const answers = await getQuestionAnswers(selectedQuestion.id);
      setSelectedQuestionAnswers(answers);
    } catch (error) {
      console.error("删除答案失败:", error);
    }
  });

  // 处理添加现有内容作为答案
  const handleAddAnswer = useMemoizedFn(
    async (item: SearchResult | SearchResult[]) => {
      if (!selectedQuestion) return;

      try {
        if (Array.isArray(item)) {
          for (const single of item) {
            await addAnswer(
              selectedQuestion.id,
              {
                contentId: single.contentId,
                content: single.content,
              },
              true,
            );
          }
        } else {
          await addAnswer(
            selectedQuestion.id,
            {
              contentId: item.contentId,
              content: item.content,
            },
            true,
          );
        }

        // 重新获取问题答案
        const answers = await getQuestionAnswers(selectedQuestion.id);
        setSelectedQuestionAnswers(answers);
      } catch (error) {
        console.error("添加答案失败:", error);
      }

      setContentSelectorVisible(false);
    },
  );

  // 处理创建新答案
  const handleCreateNewAnswer = useMemoizedFn(async () => {
    if (!selectedQuestion) return;

    try {
      if (!newAnswerContent || newAnswerContent.length === 0) {
        return;
      }

      const answer = await createAnswer(newAnswerContent);
      await addAnswer(selectedQuestion.id, {
        contentId: answer.id,
        content: answer.content,
      });

      // 重新获取问题答案
      const answers = await getQuestionAnswers(selectedQuestion.id);
      setSelectedQuestionAnswers(answers);

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
    setAnswerPreviewVisible(true);
  });

  const handleAnswerChange = useMemoizedFn((answer: IAnswer) => {
    setSelectedQuestionAnswers(
      selectedQuestionAnswers.map((a) => (a.id === answer.id ? answer : a)),
    );
  });

  const handleQuestionChange = useMemoizedFn((value: string) => {
    if (!selectedQuestion) return;
    setSelectedQuestion({ ...selectedQuestion, questionContent: value });
    updateQuestion(selectedQuestion.id, value);
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
    ? selectedQuestionAnswers.find((a) => a.id === selectedAnswerId) || null
    : null;

  const toggleShowAll = useMemoizedFn(() => {
    setShowAll((prev) => !prev);
  });

  const handleCreateQuestion = useMemoizedFn(async () => {
    if (!newQuestionContent.trim()) {
      message.error("问题内容不能为空");
      return;
    }

    try {
      await createQuestion(newQuestionContent);
      setNewQuestionModalVisible(false);
      setNewQuestionContent("");
      handleRefresh();
    } catch (error) {
      console.error("创建问题失败:", error);
      message.error("创建问题失败");
    }
  });

  const handleDeleteQuestion = useMemoizedFn(async (questionId: number) => {
    modal.confirm({
      title: "确定要删除这个问题吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        try {
          await deleteQuestion(questionId);
          handleRefresh();
        } catch (error) {
          console.error("删除问题失败:", error);
          message.error("删除问题失败");
        }
      },
    });
  });

  useEffect(() => {
    fetchQuestions();
  }, []);

  const displayQuestions = showAll ? questions : questions.slice(0, 5);
  const hasMoreQuestions = questions.length > 5;

  return (
    <div className={styles.unansweredQuestions}>
      <div className={styles.header}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          问题
        </Typography.Title>
        <div>
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={() => setNewQuestionModalVisible(true)}
          />
          <Button
            type="text"
            icon={<SyncOutlined spin={refreshing} />}
            onClick={handleRefresh}
            disabled={loading || refreshing}
          />
        </div>
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <LoadingOutlined />
          </div>
        ) : (
          <>
            <List
              dataSource={displayQuestions}
              renderItem={(question) => (
                <List.Item
                  className={styles.questionItem}
                  onClick={() => handleQuestionClick(question)}
                >
                  <Typography.Text ellipsis title={question.questionContent}>
                    {question.questionContent || "空问题"}
                  </Typography.Text>
                  <div className={styles.itemActions}>
                    <div className={styles.answerCount}>
                      {question.answers.length}
                    </div>
                    <DeleteOutlined
                      className={styles.deleteIcon}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteQuestion(question.id);
                      }}
                    />
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: "暂无未回答问题" }}
            />

            {hasMoreQuestions && (
              <div className={styles.showMoreBtn} onClick={toggleShowAll}>
                {showAll ? "收起" : "查看更多"}{" "}
                <RightOutlined rotate={showAll ? -90 : 0} />
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        title="问题详情"
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={800}
        destroyOnClose
      >
        {selectedQuestion && (
          <div className={styles.questionCard}>
            <div className={styles.header}>
              <Flex align="center" style={{ flex: 1 }}>
                <div
                  className={styles.title}
                  style={{ flexShrink: 0, width: "fit-content" }}
                >
                  问题：
                </div>
                <EditText
                  defaultValue={selectedQuestion.questionContent}
                  className={styles.title}
                  style={{ flex: 1 }}
                  contentEditable={true}
                  onChange={handleQuestionChange}
                />
              </Flex>
              <div className={styles.addButton}>
                <Dropdown
                  menu={addMenu}
                  trigger={["hover"]}
                  placement="bottomRight"
                >
                  <PlusOutlined />
                </Dropdown>
              </div>
            </div>
            <AnswerCardList
              answers={selectedQuestionAnswers}
              readOnly={true}
              onDeleteAnswer={handleDeleteAnswer}
              onViewAnswer={handleViewAnswer}
            />
          </div>
        )}
      </Modal>

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

      <ContentSelectorModal
        open={contentSelectorVisible}
        onCancel={() => setContentSelectorVisible(false)}
        onSelect={handleAddAnswer}
        contentType={["card", "article", "project-item", "document-item"]}
        extensions={extensions}
        excludeContentIds={excludeContentIds}
      />

      <AnswerModal
        visible={answerPreviewVisible}
        selectedAnswer={selectedAnswer}
        extensions={extensions}
        onClose={() => setAnswerPreviewVisible(false)}
        onAnswerChange={handleAnswerChange}
        readOnly={false}
      />

      <Modal
        title="添加新问题"
        open={newQuestionModalVisible}
        onOk={handleCreateQuestion}
        onCancel={() => {
          setNewQuestionModalVisible(false);
          setNewQuestionContent("");
        }}
      >
        <Input.TextArea
          placeholder="请输入问题内容"
          value={newQuestionContent}
          onChange={(e) => setNewQuestionContent(e.target.value)}
          rows={4}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default UnansweredQuestions;
