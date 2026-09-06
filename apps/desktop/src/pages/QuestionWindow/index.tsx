import { useEffect, useMemo, useState } from "react";
import { App } from "antd";
import { useThrottleFn, useMemoizedFn } from "ahooks";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { useQuestionStore } from "@/stores/useQuestionStore";
import CustomModal from "@/components/CustomModal";
import NewAnswerModal from "@/components/NewAnswerModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import AnswerModal from "@/components/AnswerModal";
import { getQuestionAnswers } from "@/commands";
import { Editor } from "@tau/editor/src";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { Descendant } from "slate";
import DndProvider from "@/components/DndProvider";
import QuestionSidebar from "./components/QuestionSidebar";
import Toolbar from "./components/Toolbar";
import QuestionList from "./components/QuestionList";
import type { IAnswer } from "@/types/question";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";
import { subscribeQuestionMutationEvent } from "@/mcp/question/events";
import { getAnswerContentStatus, type AnswerContentStatus } from "@/utils/answer-content";

const DEFAULT_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

const QuestionWindowPage = () => {
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const { message, modal } = App.useApp();
  const themeColors = useThemeColors();

  const {
    groups,
    groupStats,
    activeGroupId,
    createGroup,
    updateGroup,
    deleteGroup,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    itemsByGroup,
    loadGroups,
    loadGroupStats,
    loadItems,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    addAnswerSelect,
    moveToGroup,
  } = useQuestionStore();

  const [newQuestionVisible, setNewQuestionVisible] = useState(false);
  const [newQuestionValue, setNewQuestionValue] = useState("");
  const [newQuestionDescription, setNewQuestionDescription] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const [newQuestionEditorKey, setNewQuestionEditorKey] = useState(0);
  const [editQuestionVisible, setEditQuestionVisible] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [editQuestionValue, setEditQuestionValue] = useState("");
  const [editQuestionDescription, setEditQuestionDescription] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const [newAnswerVisible, setNewAnswerVisible] = useState(false);
  const [contentSelectorVisible, setContentSelectorVisible] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [answerPreviewVisible, setAnswerPreviewVisible] = useState(false);
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const [selectedQuestionAnswers, setSelectedQuestionAnswers] = useState<IAnswer[]>([]);
  const [answerTitles, setAnswerTitles] = useState<Record<number, string>>({});
  const [answerStatuses, setAnswerStatuses] = useState<Record<number, AnswerContentStatus>>({});

  const resetNewQuestionDraft = useMemoizedFn(() => {
    setNewQuestionVisible(false);
    setNewQuestionValue("");
    setNewQuestionDescription(DEFAULT_CONTENT);
    setNewQuestionEditorKey(current => current + 1);
  });

  const openNewQuestionModal = useMemoizedFn(() => {
    setNewQuestionValue("");
    setNewQuestionDescription(DEFAULT_CONTENT);
    setNewQuestionEditorKey(current => current + 1);
    setNewQuestionVisible(true);
  });

  // 在数据库连接或切换时加载问题数据
  useDatabaseChangeEffect(() => {
    loadGroups().then(loadGroupStats);
  });

  useEffect(() => {
    if (activeGroupId != null) {
      loadItems(activeGroupId);
    }
  }, [activeGroupId, filter, loadItems]);

  useEffect(() => {
    const refreshSelectedAnswers = async (questionId: number) => {
      const answers = await getQuestionAnswers(questionId);
      setSelectedQuestionAnswers(answers);
      setSelectedAnswerId(prev => {
        if (answers.length === 0) {
          setAnswerPreviewVisible(false);
          return null;
        }
        if (prev && answers.some(answer => answer.id === prev)) {
          return prev;
        }
        return answers[0]?.id ?? null;
      });
    };

    return subscribeQuestionMutationEvent(event => {
      if (event.source !== "question-mcp") {
        return;
      }

      if (
        selectedQuestionId != null &&
        (event.questionId === selectedQuestionId || event.entityId === selectedQuestionId)
      ) {
        void refreshSelectedAnswers(selectedQuestionId);
      }
    });
  }, [selectedQuestionId]);

  const { run: scheduleReorder } = useThrottleFn(
    async (ids: number[]) => {
      await useQuestionStore.getState().reorderQuestions(ids);
    },
    { wait: 300 }
  );

  const displayItems = useMemo(() => {
    if (activeGroupId == null) return [];
    // 后端 loadItems 已经根据 filter 筛选过了，这里只需要处理搜索
    const items = itemsByGroup[activeGroupId] || [];

    // 搜索筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return items.filter(q => q.questionContent.toLowerCase().includes(query));
    }

    return items;
  }, [itemsByGroup, activeGroupId, searchQuery]);

  // 加载答案的标题和类型
  useEffect(() => {
    const loadAnswerMetadata = async () => {
      const allAnswerIds = new Set<number>();
      displayItems.forEach(q => {
        q.answers.forEach(aid => allAnswerIds.add(aid));
      });

      const titles: Record<number, string> = {};
      const statuses: Record<number, AnswerContentStatus> = {};

      await Promise.all(
        Array.from(allAnswerIds).map(async contentId => {
          try {
            const status = await getAnswerContentStatus(contentId);
            titles[contentId] = `答案 #${contentId}`;
            statuses[contentId] = status;
          } catch (e) {
            console.error(`Failed to load content ${contentId}:`, e);
            titles[contentId] = `答案 #${contentId}`;
            statuses[contentId] = {
              contentId,
              isCard: false,
              isArticle: false,
              projectMountCount: 0,
              documentMountCount: 0,
            };
          }
        })
      );

      setAnswerTitles(titles);
      setAnswerStatuses(statuses);
    };

    if (displayItems.length > 0) {
      loadAnswerMetadata();
      return;
    }

    setAnswerTitles({});
    setAnswerStatuses({});
  }, [displayItems]);

  const onCreateQuestion = async () => {
    if (!newQuestionValue.trim()) {
      message.error("问题内容不能为空");
      return;
    }
    if (activeGroupId == null) {
      message.error("请选择一个分类");
      return;
    }
    // 检查描述是否为空（只包含空段落）
    const hasDescription =
      newQuestionDescription &&
      newQuestionDescription.length > 0 &&
      !(
        newQuestionDescription.length === 1 &&
        newQuestionDescription[0].type === "paragraph" &&
        newQuestionDescription[0].children?.length === 1 &&
        "text" in newQuestionDescription[0].children[0] &&
        newQuestionDescription[0].children[0].text === ""
      );
    await createQuestion({
      questionContent: newQuestionValue,
      groupId: activeGroupId,
      description: hasDescription ? newQuestionDescription : DEFAULT_CONTENT,
    });
    resetNewQuestionDraft();
    if (activeGroupId != null) await loadItems(activeGroupId);
    await loadGroupStats();
  };

  const handleViewDetails = (id: number) => {
    const question = displayItems.find(q => q.id === id);
    if (!question) return;
    setEditingQuestionId(id);
    setEditQuestionValue(question.questionContent);
    setEditQuestionDescription(question.description || DEFAULT_CONTENT);
    setEditQuestionVisible(true);
  };

  const onUpdateQuestionDetails = async () => {
    if (!editQuestionValue.trim()) {
      message.error("问题内容不能为空");
      return;
    }
    if (editingQuestionId == null) return;

    // 检查描述是否为空（只包含空段落）
    const hasDescription =
      editQuestionDescription &&
      editQuestionDescription.length > 0 &&
      !(
        editQuestionDescription.length === 1 &&
        editQuestionDescription[0].type === "paragraph" &&
        editQuestionDescription[0].children?.length === 1 &&
        "text" in editQuestionDescription[0].children[0] &&
        editQuestionDescription[0].children[0].text === ""
      );

    await updateQuestion({
      id: editingQuestionId,
      questionContent: editQuestionValue,
      description: hasDescription ? editQuestionDescription : DEFAULT_CONTENT,
    });
    setEditQuestionVisible(false);
    setEditingQuestionId(null);
    setEditQuestionValue("");
    setEditQuestionDescription(DEFAULT_CONTENT);
    if (activeGroupId != null) await loadItems(activeGroupId);
  };

  const onDeleteQuestion = (id: number) => {
    modal.confirm({
      title: "确定要删除这个问题吗？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteQuestion(id);
      },
    });
  };

  const openNewAnswer = (qid: number) => {
    setSelectedQuestionId(qid);
    setNewAnswerVisible(true);
  };

  const openSelectAnswer = (qid: number) => {
    setSelectedQuestionId(qid);
    setContentSelectorVisible(true);
  };

  const onSelectExistingAnswer = async (item: { contentId: number } | { contentId: number }[]) => {
    if (!selectedQuestionId) return;
    if (Array.isArray(item)) {
      for (const it of item) await addAnswerSelect(selectedQuestionId, it.contentId);
    } else {
      await addAnswerSelect(selectedQuestionId, item.contentId);
    }
    setContentSelectorVisible(false);
  };

  const selectedAnswer = useMemo(() => {
    if (!selectedAnswerId) return null;
    return selectedQuestionAnswers.find(a => a.id === selectedAnswerId) || null;
  }, [selectedAnswerId, selectedQuestionAnswers]);

  const currentAnswerIndex = useMemo(() => {
    if (!selectedAnswerId) return -1;
    return selectedQuestionAnswers.findIndex(a => a.id === selectedAnswerId);
  }, [selectedAnswerId, selectedQuestionAnswers]);

  const handleCreateGroup = useMemoizedFn(async (title: string, color?: string) => {
    await createGroup({ title, color });
    await loadGroupStats();
  });

  const handleUpdateGroup = useMemoizedFn(
    async (payload: { id: number; title?: string; color?: string }) => {
      await updateGroup(payload);
      await loadGroupStats();
    }
  );

  const handleDeleteGroup = useMemoizedFn(async (groupId: number) => {
    modal.confirm({
      title: "确定要删除这个分组吗？",
      content: "分组中的问题将移动到默认分组",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteGroup(groupId);
        await loadGroups();
        await loadGroupStats();
      },
    });
  });

  const handleGroupTitleChange = useMemoizedFn(async (title: string) => {
    if (!activeGroupId) return;
    await updateGroup({ id: activeGroupId, title });
    await loadGroups();
  });

  const activeGroup = useMemo(
    () => groups.find(g => g.id === activeGroupId),
    [groups, activeGroupId]
  );

  const totalCount = useMemo(
    () => (activeGroupId != null ? (groupStats[activeGroupId]?.total ?? 0) : 0),
    [activeGroupId, groupStats]
  );

  const handleOpenAnswer = async (questionId: number, answerId: number) => {
    setSelectedQuestionId(questionId);
    const answers = await getQuestionAnswers(questionId);
    setSelectedQuestionAnswers(answers);
    const found = answers.find(a => a.id === answerId);
    setSelectedAnswerId(found?.id || answers[0]?.id || null);
    setAnswerPreviewVisible(true);
  };

  const handleDeleteAnswer = async (questionId: number, answerId: number) => {
    await useQuestionStore.getState().deleteAnswer(questionId, answerId);
    if (activeGroupId != null) {
      await loadItems(activeGroupId);
    }
    if (selectedQuestionId === questionId) {
      const answers = await getQuestionAnswers(questionId);
      setSelectedQuestionAnswers(answers);
      setSelectedAnswerId(answers[0]?.id ?? null);
      if (answers.length === 0) {
        setAnswerPreviewVisible(false);
      }
    }
  };

  const handleUpdateStatus = async (
    id: number,
    status: "not_started" | "in_progress" | "resolved"
  ) => {
    await useQuestionStore.getState().updateQuestionStatus(id, status);
  };

  const handlePrevAnswer = () => {
    if (!selectedQuestionAnswers.length) return;
    setSelectedAnswerId(prev => {
      if (!prev) return selectedQuestionAnswers[0]?.id ?? null;
      const currentIndex = selectedQuestionAnswers.findIndex(a => a.id === prev);
      if (currentIndex === -1) return selectedQuestionAnswers[0]?.id ?? null;
      const nextIndex =
        (currentIndex - 1 + selectedQuestionAnswers.length) % selectedQuestionAnswers.length;
      return selectedQuestionAnswers[nextIndex].id;
    });
  };

  const handleNextAnswer = () => {
    if (!selectedQuestionAnswers.length) return;
    setSelectedAnswerId(prev => {
      if (!prev) return selectedQuestionAnswers[0]?.id ?? null;
      const currentIndex = selectedQuestionAnswers.findIndex(a => a.id === prev);
      if (currentIndex === -1) return selectedQuestionAnswers[0]?.id ?? null;
      const nextIndex = (currentIndex + 1) % selectedQuestionAnswers.length;
      return selectedQuestionAnswers[nextIndex].id;
    });
  };

  return (
    <DndProvider>
      <div className="flex h-full w-full overflow-hidden">
        <QuestionSidebar
          onCreateGroup={handleCreateGroup}
          onUpdateGroup={handleUpdateGroup}
          onDeleteGroup={handleDeleteGroup}
        />

        <div className="flex h-full min-w-0 flex-1 flex-col">
          {activeGroupId != null && activeGroup ? (
            <>
              <Toolbar
                key={activeGroupId}
                isDefault={activeGroup.isDefault}
                groupTitle={activeGroup.title}
                totalCount={totalCount}
                filter={filter}
                searchQuery={searchQuery}
                onGroupTitleChange={handleGroupTitleChange}
                onFilterChange={setFilter}
                onSearch={setSearchQuery}
                onCreateQuestion={openNewQuestionModal}
              />

              <div className="min-h-0 flex-1 overflow-auto">
                <QuestionList
                  questions={displayItems}
                  groups={groups}
                  answerTitles={answerTitles}
                  answerStatuses={answerStatuses}
                  onUpdateTitle={(id, title) => updateQuestion({ id, questionContent: title })}
                  onOpenNewAnswer={openNewAnswer}
                  onOpenSelectAnswer={openSelectAnswer}
                  onMoveToGroup={moveToGroup}
                  onDelete={onDeleteQuestion}
                  onReorder={scheduleReorder}
                  onOpenAnswer={handleOpenAnswer}
                  onDeleteAnswer={handleDeleteAnswer}
                  onUpdateStatus={handleUpdateStatus}
                  onViewDetails={handleViewDetails}
                />
              </div>
            </>
          ) : (
            <div
              className={classNames(
                "flex h-full items-center justify-center transition-colors",
                themeColors.textClass
              )}
            >
              请选择一个分类
            </div>
          )}
        </div>

        <CustomModal
          open={newQuestionVisible}
          onCancel={resetNewQuestionDraft}
          width={800}
          title="新建问题"
          subtitle="输入问题内容和描述"
          icon={
            <svg
              className="h-5 w-5 text-[var(--th-accent)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9 12h6m-3-3v6" />
            </svg>
          }
          iconBgColor="bg-[var(--th-accent-soft)] border-[var(--th-border-focus)]/30"
          closeOnEscape={false}
          footer={
            <div className="flex justify-end gap-3">
              <button
                onClick={resetNewQuestionDraft}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                onClick={onCreateQuestion}
                disabled={!newQuestionValue.trim()}
                className="cursor-pointer rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
              >
                确定
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                问题标题 <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="请输入问题内容"
                value={newQuestionValue}
                onChange={e => setNewQuestionValue(e.target.value)}
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                问题描述（可选）
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 shadow-inner transition-all focus-within:border-[var(--th-border-focus)] focus-within:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950">
                <Editor
                  key={`new-question-${newQuestionEditorKey}`}
                  initValue={newQuestionDescription}
                  onChange={value => setNewQuestionDescription(value)}
                  readonly={false}
                  extensions={dynamicExtensions}
                  style={{
                    minHeight: 200,
                    maxHeight: 400,
                    overflow: "auto",
                    padding: "14px 16px",
                  }}
                />
              </div>
            </div>
          </div>
        </CustomModal>

        <CustomModal
          open={editQuestionVisible}
          onCancel={() => {
            setEditQuestionVisible(false);
            setEditingQuestionId(null);
            setEditQuestionValue("");
            setEditQuestionDescription(DEFAULT_CONTENT);
          }}
          width={800}
          title="编辑问题"
          subtitle="修改问题内容和描述"
          icon={
            <svg
              className="h-5 w-5 text-[var(--th-accent)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          }
          iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-[var(--th-border-focus)]/30"
          closeOnEscape={false}
          footer={
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setEditQuestionVisible(false);
                  setEditingQuestionId(null);
                  setEditQuestionValue("");
                  setEditQuestionDescription(DEFAULT_CONTENT);
                }}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                onClick={onUpdateQuestionDetails}
                disabled={!editQuestionValue.trim()}
                className="cursor-pointer rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
              >
                保存
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                问题标题 <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="请输入问题内容"
                value={editQuestionValue}
                onChange={e => setEditQuestionValue(e.target.value)}
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                问题描述（可选）
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 shadow-inner transition-all focus-within:border-[var(--th-border-focus)] focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:border-slate-700 dark:bg-zinc-950 dark:focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]">
                <Editor
                  key={`edit-question-${editingQuestionId}`}
                  initValue={editQuestionDescription}
                  onChange={value => setEditQuestionDescription(value)}
                  readonly={false}
                  extensions={dynamicExtensions}
                  style={{
                    minHeight: 200,
                    maxHeight: 400,
                    overflow: "auto",
                    padding: "14px 16px",
                  }}
                />
              </div>
            </div>
          </div>
        </CustomModal>

        <NewAnswerModal
          visible={newAnswerVisible}
          questionId={selectedQuestionId}
          extensions={dynamicExtensions}
          onClose={() => {
            setNewAnswerVisible(false);
            if (activeGroupId != null) loadItems(activeGroupId);
            loadGroupStats();
          }}
        />

        <ContentSelectorModal
          open={contentSelectorVisible}
          onCancel={() => setContentSelectorVisible(false)}
          onSelect={onSelectExistingAnswer}
          contentType={["card", "article", "project-item", "document-item", "diary-daily"]}
          extensions={dynamicExtensions}
        />
        <AnswerModal
          visible={answerPreviewVisible}
          selectedAnswer={selectedAnswer}
          extensions={dynamicExtensions}
          onClose={() => {
            setAnswerPreviewVisible(false);
            // 清空状态，确保下次打开时是全新的状态
            setSelectedAnswerId(null);
            setSelectedQuestionAnswers([]);
          }}
          onAnswerChange={() => {
            if (activeGroupId != null) loadItems(activeGroupId);
          }}
          readOnly={false}
          currentIndex={currentAnswerIndex}
          total={selectedQuestionAnswers.length}
          onPrev={handlePrevAnswer}
          onNext={handleNextAnswer}
        />
      </div>
    </DndProvider>
  );
};

export default QuestionWindowPage;
