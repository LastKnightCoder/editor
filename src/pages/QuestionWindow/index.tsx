import { useEffect, useMemo, useState } from "react";
import { App, Modal, Input } from "antd";
import { useThrottleFn, useMemoizedFn } from "ahooks";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import useInitDatabase from "@/hooks/useInitDatabase";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useQuestionStore } from "@/stores/useQuestionStore";
import NewAnswerModal from "@/components/NewAnswerModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import AnswerModal from "@/components/AnswerModal";
import { getQuestionAnswers, isContentIsCard } from "@/commands";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";
import { Descendant } from "slate";
import DndProvider from "@/components/DndProvider";
import QuestionGroupList from "./components/QuestionGroupList";
import Toolbar from "./components/Toolbar";
import QuestionList from "./components/QuestionList";
import type { IAnswer } from "@/types/question";

const QuestionWindowPage = () => {
  const { active } = useInitDatabase();
  const isConnected = useDatabaseConnected();
  const { message, modal } = App.useApp();
  const extensions = useDynamicExtensions();

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
    addAnswerNew,
    addAnswerSelect,
    moveToGroup,
  } = useQuestionStore();

  const [newQuestionVisible, setNewQuestionVisible] = useState(false);
  const [newQuestionValue, setNewQuestionValue] = useState("");
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
  const DEFAULT_CONTENT: Descendant[] = [
    { type: "paragraph", children: [{ type: "formatted", text: "" }] },
  ];
  const [newAnswerContent, setNewAnswerContent] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const [answerTitles, setAnswerTitles] = useState<Record<number, string>>({});
  const [answerTypes, setAnswerTypes] = useState<Record<number, string>>({});

  useEffect(() => {
    if (isConnected && active) {
      loadGroups().then(loadGroupStats);
    }
  }, [isConnected, active, loadGroups, loadGroupStats]);

  useEffect(() => {
    if (activeGroupId != null) {
      loadItems(activeGroupId);
    }
  }, [activeGroupId, loadItems]);

  const { run: scheduleReorder } = useThrottleFn(
    async (ids: number[]) => {
      await useQuestionStore.getState().reorderQuestions(ids);
    },
    { wait: 300 },
  );

  const displayItems = useMemo(() => {
    if (activeGroupId == null) return [];
    const items = itemsByGroup[activeGroupId] || [];

    // 筛选
    let filtered = items;
    if (filter === "answered") {
      filtered = items.filter((q) => q.answers.length > 0);
    } else if (filter === "unanswered") {
      filtered = items.filter((q) => q.answers.length === 0);
    }

    // 搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((q) =>
        q.questionContent.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [itemsByGroup, activeGroupId, filter, searchQuery]);

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
    await createQuestion({
      questionContent: newQuestionValue,
      groupId: activeGroupId || undefined,
    });
    setNewQuestionVisible(false);
    setNewQuestionValue("");
    if (activeGroupId != null) await loadItems(activeGroupId);
    await loadGroupStats();
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
    setNewAnswerContent(DEFAULT_CONTENT);
    setNewAnswerVisible(true);
  };

  const openSelectAnswer = (qid: number) => {
    setSelectedQuestionId(qid);
    setContentSelectorVisible(true);
  };

  const onNewAnswerOk = async () => {
    if (!selectedQuestionId) return;
    await addAnswerNew(selectedQuestionId, newAnswerContent);
    setNewAnswerVisible(false);
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

  return (
    <DndProvider>
      <div className="flex w-full h-full overflow-hidden bg-[var(--main-bg-color)]">
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
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              请选择一个分类
            </div>
          )}
        </div>

        <Modal
          title="新建问题"
          open={newQuestionVisible}
          onOk={onCreateQuestion}
          onCancel={() => {
            setNewQuestionVisible(false);
            setNewQuestionValue("");
          }}
        >
          <Input.TextArea
            rows={4}
            placeholder="请输入问题内容"
            value={newQuestionValue}
            onChange={(e) => setNewQuestionValue(e.target.value)}
          />
        </Modal>

        <NewAnswerModal
          visible={newAnswerVisible}
          defaultContent={DEFAULT_CONTENT}
          extensions={extensions}
          onCancel={() => {
            setNewAnswerVisible(false);
            setNewAnswerContent(DEFAULT_CONTENT);
          }}
          onOk={onNewAnswerOk}
          onChange={(v) => setNewAnswerContent(v)}
        />

        <ContentSelectorModal
          open={contentSelectorVisible}
          onCancel={() => setContentSelectorVisible(false)}
          onSelect={onSelectExistingAnswer}
          contentType={["card", "article", "project-item", "document-item"]}
          extensions={extensions}
        />
        <AnswerModal
          visible={answerPreviewVisible}
          selectedAnswer={selectedAnswer}
          extensions={extensions}
          onClose={() => setAnswerPreviewVisible(false)}
          onAnswerChange={() => {
            if (activeGroupId != null) loadItems(activeGroupId);
          }}
          readOnly={false}
        />
      </div>
    </DndProvider>
  );
};

export default QuestionWindowPage;
