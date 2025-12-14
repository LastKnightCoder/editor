import { useEffect, useMemo, useState } from "react";
import { App } from "antd";
import { useThrottleFn, useMemoizedFn } from "ahooks";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { useQuestionStore } from "@/stores/useQuestionStore";
import CustomModal from "@/components/CustomModal";
import NewAnswerModal from "@/components/NewAnswerModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import AnswerModal from "@/components/AnswerModal";
import { getQuestionAnswers, isContentIsCard } from "@/commands";
import { Editor } from "@tau/editor/src";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
} from "@/editor-extensions";
const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
];
import { Descendant } from "slate";
import DndProvider from "@/components/DndProvider";
import QuestionGroupList from "./components/QuestionGroupList";
import Toolbar from "./components/Toolbar";
import QuestionList from "./components/QuestionList";
import type { IAnswer } from "@/types/question";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

const DEFAULT_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

const QuestionWindowPage = () => {
  const { message, modal } = App.useApp();
  const themeColors = useThemeColors();

  const {
    leftOpen,
    leftWidth,
    setLeftWidth,
    groups,
    groupStats,
    activeGroupId,
    setActiveGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
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
  const [editQuestionVisible, setEditQuestionVisible] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(
    null,
  );
  const [editQuestionValue, setEditQuestionValue] = useState("");
  const [editQuestionDescription, setEditQuestionDescription] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const [newAnswerVisible, setNewAnswerVisible] = useState(false);
  const [contentSelectorVisible, setContentSelectorVisible] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(
    null,
  );
  const [answerPreviewVisible, setAnswerPreviewVisible] = useState(false);
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const [selectedQuestionAnswers, setSelectedQuestionAnswers] = useState<
    IAnswer[]
  >([]);
  const [answerTitles, setAnswerTitles] = useState<Record<number, string>>({});
  const [answerTypes, setAnswerTypes] = useState<Record<number, string>>({});

  // 在数据库连接或切换时加载问题数据
  useDatabaseChangeEffect(() => {
    loadGroups().then(loadGroupStats);
  });

  useEffect(() => {
    if (activeGroupId != null) {
      loadItems(activeGroupId);
    }
  }, [activeGroupId, filter, loadItems]);

  const { run: scheduleReorder } = useThrottleFn(
    async (ids: number[]) => {
      await useQuestionStore.getState().reorderQuestions(ids);
    },
    { wait: 300 },
  );

  const displayItems = useMemo(() => {
    if (activeGroupId == null) return [];
    // 后端 loadItems 已经根据 filter 筛选过了，这里只需要处理搜索
    const items = itemsByGroup[activeGroupId] || [];

    // 搜索筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return items.filter((q) =>
        q.questionContent.toLowerCase().includes(query),
      );
    }

    return items;
  }, [itemsByGroup, activeGroupId, searchQuery]);

  // 加载答案的标题和类型
  useEffect(() => {
    const loadAnswerMetadata = async () => {
      const allAnswerIds = new Set<number>();
      displayItems.forEach((q) => {
        q.answers.forEach((aid) => allAnswerIds.add(aid));
      });

      const titles: Record<number, string> = {};
      const types: Record<number, string> = {};

      await Promise.all(
        Array.from(allAnswerIds).map(async (contentId) => {
          try {
            const isCard = await isContentIsCard(contentId);
            titles[contentId] = `答案 #${contentId}`;
            types[contentId] = isCard ? "card" : "custom";
          } catch (e) {
            console.error(`Failed to load content ${contentId}:`, e);
            titles[contentId] = `答案 #${contentId}`;
            types[contentId] = "custom";
          }
        }),
      );

      setAnswerTitles(titles);
      setAnswerTypes(types);
    };

    if (displayItems.length > 0) {
      loadAnswerMetadata();
    }
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
    setNewQuestionVisible(false);
    setNewQuestionValue("");
    setNewQuestionDescription(DEFAULT_CONTENT);
    if (activeGroupId != null) await loadItems(activeGroupId);
    await loadGroupStats();
  };

  const handleViewDetails = (id: number) => {
    const question = displayItems.find((q) => q.id === id);
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

  const onSelectExistingAnswer = async (
    item: { contentId: number } | { contentId: number }[],
  ) => {
    if (!selectedQuestionId) return;
    if (Array.isArray(item)) {
      for (const it of item)
        await addAnswerSelect(selectedQuestionId, it.contentId);
    } else {
      await addAnswerSelect(selectedQuestionId, item.contentId);
    }
    setContentSelectorVisible(false);
  };

  const selectedAnswer = useMemo(() => {
    if (!selectedAnswerId) return null;
    return (
      selectedQuestionAnswers.find((a) => a.id === selectedAnswerId) || null
    );
  }, [selectedAnswerId, selectedQuestionAnswers]);

  const currentAnswerIndex = useMemo(() => {
    if (!selectedAnswerId) return -1;
    return selectedQuestionAnswers.findIndex((a) => a.id === selectedAnswerId);
  }, [selectedAnswerId, selectedQuestionAnswers]);

  const handleCreateGroup = async (title: string, color?: string) => {
    await createGroup({ title, color });
    await loadGroupStats();
  };

  const handleUpdateGroup = async (payload: {
    id: number;
    title?: string;
    color?: string;
  }) => {
    await updateGroup(payload);
    await loadGroupStats();
  };

  const handleDeleteGroup = async (groupId: number) => {
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
  };

  const handleGroupTitleChange = useMemoizedFn(async (title: string) => {
    if (!activeGroupId) return;
    await updateGroup({ id: activeGroupId, title });
    await loadGroups();
  });

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId),
    [groups, activeGroupId],
  );

  const totalCount = useMemo(
    () => (activeGroupId != null ? (groupStats[activeGroupId]?.total ?? 0) : 0),
    [activeGroupId, groupStats],
  );

  const handleOpenAnswer = async (questionId: number, answerId: number) => {
    setSelectedQuestionId(questionId);
    const answers = await getQuestionAnswers(questionId);
    setSelectedQuestionAnswers(answers);
    const found = answers.find((a) => a.id === answerId);
    setSelectedAnswerId(found?.id || answers[0]?.id || null);
    setAnswerPreviewVisible(true);
  };

  const handleDeleteAnswer = async (questionId: number, answerId: number) => {
    await useQuestionStore.getState().deleteAnswer(questionId, answerId);
    if (activeGroupId != null) {
      await loadItems(activeGroupId);
    }
  };

  const handleUpdateStatus = async (
    id: number,
    status: "not_started" | "in_progress" | "resolved",
  ) => {
    await useQuestionStore.getState().updateQuestionStatus(id, status);
  };

  const handlePrevAnswer = () => {
    if (!selectedQuestionAnswers.length) return;
    setSelectedAnswerId((prev) => {
      if (!prev) return selectedQuestionAnswers[0]?.id ?? null;
      const currentIndex = selectedQuestionAnswers.findIndex(
        (a) => a.id === prev,
      );
      if (currentIndex === -1) return selectedQuestionAnswers[0]?.id ?? null;
      const nextIndex =
        (currentIndex - 1 + selectedQuestionAnswers.length) %
        selectedQuestionAnswers.length;
      return selectedQuestionAnswers[nextIndex].id;
    });
  };

  const handleNextAnswer = () => {
    if (!selectedQuestionAnswers.length) return;
    setSelectedAnswerId((prev) => {
      if (!prev) return selectedQuestionAnswers[0]?.id ?? null;
      const currentIndex = selectedQuestionAnswers.findIndex(
        (a) => a.id === prev,
      );
      if (currentIndex === -1) return selectedQuestionAnswers[0]?.id ?? null;
      const nextIndex = (currentIndex + 1) % selectedQuestionAnswers.length;
      return selectedQuestionAnswers[nextIndex].id;
    });
  };

  return (
    <DndProvider>
      <div className="flex w-full h-full overflow-hidden">
        <ResizeableAndHideableSidebar
          width={leftWidth}
          open={leftOpen}
          onWidthChange={(w) => setLeftWidth(w || leftWidth)}
          className="h-full overflow-hidden"
          minWidth={200}
          maxWidth={300}
        >
          <QuestionGroupList
            groups={groups}
            groupStats={groupStats}
            activeGroupId={activeGroupId}
            onSetActive={setActiveGroup}
            onCreateGroup={handleCreateGroup}
            onUpdateGroup={handleUpdateGroup}
            onDeleteGroup={handleDeleteGroup}
            onReorderGroups={reorderGroups}
          />
        </ResizeableAndHideableSidebar>

        <div className="flex flex-col flex-1 h-full min-w-0">
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
                onCreateQuestion={() => setNewQuestionVisible(true)}
              />

              <div className="flex-1 min-h-0 overflow-auto">
                <QuestionList
                  questions={displayItems}
                  groups={groups}
                  answerTitles={answerTitles}
                  answerTypes={answerTypes}
                  onUpdateTitle={(id, title) =>
                    updateQuestion({ id, questionContent: title })
                  }
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
                "flex items-center justify-center h-full transition-colors",
                themeColors.textClass,
              )}
            >
              请选择一个分类
            </div>
          )}
        </div>

        <CustomModal
          open={newQuestionVisible}
          onCancel={() => {
            setNewQuestionVisible(false);
            setNewQuestionValue("");
            setNewQuestionDescription(DEFAULT_CONTENT);
          }}
          width={800}
          title="新建问题"
          subtitle="输入问题内容和描述"
          icon={
            <svg
              className="w-5 h-5 text-green-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9 12h6m-3-3v6" />
            </svg>
          }
          iconBgColor="bg-green-50 dark:bg-green-500/20 border-green-200 dark:border-green-500/30"
          closeOnEscape={false}
          footer={
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setNewQuestionVisible(false);
                  setNewQuestionValue("");
                  setNewQuestionDescription(DEFAULT_CONTENT);
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
              >
                取消
              </button>
              <button
                onClick={onCreateQuestion}
                disabled={!newQuestionValue.trim()}
                className="px-5 py-2.5 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-green-500 text-white shadow-[0_4px_14px_rgba(34,197,94,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-green-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
              >
                确定
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
                问题标题 <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="请输入问题内容"
                value={newQuestionValue}
                onChange={(e) => setNewQuestionValue(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all resize-none bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-green-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(34,197,94,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(34,197,94,0.25)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
                问题描述（可选）
              </label>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950 shadow-inner transition-all focus-within:border-green-500 focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(34,197,94,0.15)] dark:focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(34,197,94,0.25)]">
                <Editor
                  initValue={newQuestionDescription}
                  onChange={(value) => setNewQuestionDescription(value)}
                  readonly={false}
                  extensions={customExtensions}
                  style={{ minHeight: 200, maxHeight: 400, overflow: "auto", padding: "14px 16px" }}
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
              className="w-5 h-5 text-blue-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          }
          iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
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
                className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
              >
                取消
              </button>
              <button
                onClick={onUpdateQuestionDetails}
                disabled={!editQuestionValue.trim()}
                className="px-5 py-2.5 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-blue-500 text-white shadow-[0_4px_14px_rgba(59,130,246,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-blue-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
              >
                保存
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
                问题标题 <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="请输入问题内容"
                value={editQuestionValue}
                onChange={(e) => setEditQuestionValue(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all resize-none bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
                问题描述（可选）
              </label>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950 shadow-inner transition-all focus-within:border-blue-500 focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]">
                <Editor
                  key={`edit-question-${editingQuestionId}`}
                  initValue={editQuestionDescription}
                  onChange={(value) => setEditQuestionDescription(value)}
                  readonly={false}
                  extensions={customExtensions}
                  style={{ minHeight: 200, maxHeight: 400, overflow: "auto", padding: "14px 16px" }}
                />
              </div>
            </div>
          </div>
        </CustomModal>

        <NewAnswerModal
          visible={newAnswerVisible}
          questionId={selectedQuestionId}
          extensions={customExtensions}
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
          contentType={["card", "article", "project-item", "document-item"]}
          extensions={customExtensions}
        />
        <AnswerModal
          visible={answerPreviewVisible}
          selectedAnswer={selectedAnswer}
          extensions={customExtensions}
          onClose={() => setAnswerPreviewVisible(false)}
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