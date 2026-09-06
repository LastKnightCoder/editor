import { memo, useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "motion/react";
import { App } from "antd";
import { Check, ChevronDown, Component, Loader2, Sparkles, SquarePen, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Descendant } from "slate";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import CollaborationPanel from "@/components/CollaborationPanel";
import FlashcardReviewDeckList, { slateToPlainText } from "@/components/FlashcardReviewDeckList";
import CardPreview from "@/pages/card-list-view/CardPreview";
import ReviewModal from "@/pages/FlashcardCenter/ReviewModal";
import QuestionItem from "@/pages/QuestionWindow/components/QuestionItem";
import CustomModal from "@/components/CustomModal";
import NewAnswerModal from "@/components/NewAnswerModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import AnswerModal from "@/components/AnswerModal";
import TodoDetailsPanel from "@/components/Todo/Details/DetailsPanel";
import { Editor } from "@tau/editor/src";
import useFlashcardStore from "@/stores/useFlashcardStore";
import useRightChatSidebarStore from "@/stores/useRightChatSidebarStore";
import { useTodoStore } from "@/stores/useTodoStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import {
  addAnswer,
  deleteCard,
  deleteAnswer,
  deleteQuestion,
  deleteTodoItemCascade,
  getFlashcardReviewQueue,
  getQuestionAnswers,
  moveQuestionToGroup,
  toggleCompleteCascade,
  updateQuestion,
  updateQuestionStatus,
} from "@/commands";
import type { Flashcard, IAnswer, SearchResult, TodoItem } from "@/types";
import { getAnswerContentStatus, type AnswerContentStatus } from "@/utils/answer-content";
import { useComponentsWorkbenchData } from "./useComponentsWorkbenchData";
import "./index.css";

const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

const formatRemaining = (remainingMs: number) => {
  if (remainingMs <= 0) return "已过期";
  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / 3600000);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时`;
  const minutes = Math.max(1, Math.floor(remainingMs / 60000));
  return `${minutes} 分钟`;
};

const iconButtonClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--th-accent)]/40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100";

const Section = ({
  title,
  count,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-t border-slate-900/10 pt-3 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="focus-visible:ring-[var(--th-accent)]/40 flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2"
        >
          <ChevronDown
            size={15}
            className={classNames(
              "shrink-0 text-slate-500 transition dark:text-slate-400",
              !open && "-rotate-90"
            )}
          />
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </span>
          {typeof count === "number" && (
            <span className="bg-slate-900/6 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {count}
            </span>
          )}
        </button>
        {action}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

const LoadMoreButton = ({ loading, onClick }: { loading: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
  >
    {loading ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={14} />}
    加载更多
  </button>
);

const FilterChip = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={classNames(
      "rounded-lg border px-2 py-1 text-[11px] transition",
      active
        ? "border-[var(--th-border-focus)]/30 hover:bg-[var(--th-accent)]/15 bg-[var(--th-accent-soft)] font-medium text-[var(--th-active-text)]"
        : "border-slate-900/10 text-slate-600 hover:bg-slate-900/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
    )}
  >
    {children}
  </button>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-xl border border-dashed border-slate-900/10 px-3 py-4 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
    {text}
  </div>
);

const TodoRow = ({
  item,
  depth,
  onEdit,
  onChanged,
}: {
  item: TodoItem;
  depth: number;
  onEdit: (item: TodoItem) => void;
  onChanged: () => void;
}) => {
  return (
    <div
      className="rounded-xl border border-slate-900/10 bg-white/65 p-2.5 dark:border-white/10 dark:bg-zinc-950/35"
      style={{ marginLeft: depth * 14 }}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          title={item.isCompleted ? "标记为未完成" : "标记为完成"}
          aria-label={item.isCompleted ? "标记为未完成" : "标记为完成"}
          onClick={async () => {
            await toggleCompleteCascade(item.id, !item.isCompleted);
            onChanged();
          }}
          className={classNames(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
            item.isCompleted
              ? "border-[var(--th-accent)] bg-[var(--th-accent)] text-white"
              : "border-slate-300 text-transparent hover:border-[var(--th-accent)] dark:border-slate-600"
          )}
        >
          <Check size={13} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
            {item.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>{item.type}</span>
            {item.dueAt && (
              <span className={item.dueAt < Date.now() && !item.isCompleted ? "text-rose-500" : ""}>
                {new Date(item.dueAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="编辑任务"
            aria-label="编辑任务"
            className={iconButtonClass}
            onClick={() => onEdit(item)}
          >
            <SquarePen size={14} />
          </button>
          <button
            type="button"
            title="删除任务"
            aria-label="删除任务"
            className={iconButtonClass}
            onClick={async () => {
              if (!window.confirm("删除这个任务？")) return;
              await deleteTodoItemCascade(item.id);
              onChanged();
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const RightComponentsSidebar = memo(() => {
  const { activePanel, componentsWidth, setComponentsWidth } = useRightChatSidebarStore(
    useShallow(state => ({
      activePanel: state.activePanel,
      componentsWidth: state.componentsWidth,
      setComponentsWidth: state.setComponentsWidth,
    }))
  );
  const open = activePanel === "components";
  const data = useComponentsWorkbenchData(open);
  const { modal } = App.useApp();
  const [previewCardId, setPreviewCardId] = useState<number | undefined>();
  const [now, setNow] = useState(Date.now());
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [workbenchReviewQueue, setWorkbenchReviewQueue] = useState<Flashcard[]>([]);
  const [reviewModalQueue, setReviewModalQueue] = useState<Flashcard[]>([]);
  const [reviewingDeckId, setReviewingDeckId] = useState<number | null>(null);
  const [newAnswerVisible, setNewAnswerVisible] = useState(false);
  const [contentSelectorVisible, setContentSelectorVisible] = useState(false);
  const [answerPreviewVisible, setAnswerPreviewVisible] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [selectedQuestionAnswers, setSelectedQuestionAnswers] = useState<IAnswer[]>([]);
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const [todoGroupId, setTodoGroupId] = useState<number | null>(null);
  const [todoStatus, setTodoStatus] = useState<"pending" | "completed" | "all">("pending");
  const [questionGroupId, setQuestionGroupId] = useState<number | null>(null);
  const [questionStatusFilter, setQuestionStatusFilter] = useState<
    "all" | "not_started" | "in_progress" | "resolved"
  >("all");
  const [answerTitles, setAnswerTitles] = useState<Record<number, string>>({});
  const [answerStatuses, setAnswerStatuses] = useState<Record<number, AnswerContentStatus>>({});
  const [editQuestionId, setEditQuestionId] = useState<number | null>(null);
  const [editQuestionValue, setEditQuestionValue] = useState("");
  const [editQuestionDescription, setEditQuestionDescription] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const { setActiveTodo, setRightOpen } = useTodoStore(
    useShallow(state => ({
      setActiveTodo: state.setActiveTodo,
      setRightOpen: state.setRightOpen,
    }))
  );

  const { loadingReview, queueReviews, submitReview, fetchDecks } = useFlashcardStore(
    useShallow(state => ({
      loadingReview: state.loadingReview,
      queueReviews: state.queueReviews,
      submitReview: state.submitReview,
      fetchDecks: state.fetchDecks,
    }))
  );
  const flashcardDecks = useFlashcardStore(state => state.decks);

  const refreshWorkbenchReviewQueue = async () => {
    const queue = await getFlashcardReviewQueue({
      deckId: null,
      limit: 30,
    });
    setWorkbenchReviewQueue(queue);
    return queue;
  };

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (open) {
      void fetchDecks();
      void refreshWorkbenchReviewQueue();
    }
  }, [fetchDecks, open]);

  const dueCards = data.cards.data?.items ?? [];
  const dueFlashcards = workbenchReviewQueue.length;
  const pendingTodos = data.todo.data?.pendingTotal ?? 0;
  const pendingQuestions =
    (data.questions.data?.notStartedTotal ?? 0) + (data.questions.data?.inProgressTotal ?? 0);
  const totalCount =
    (data.cards.data?.total ?? 0) + dueFlashcards + pendingTodos + pendingQuestions;

  const selectedReviewDeckId = useMemo(
    () => reviewModalQueue[0]?.deckId ?? null,
    [reviewModalQueue]
  );
  const questionItems = useMemo(
    () => data.questions.data?.items ?? [],
    [data.questions.data?.items]
  );
  const questionGroups = useMemo(
    () =>
      (data.questions.data?.groups ?? []).map(({ group }) => ({
        id: group.id,
        title: group.title,
      })),
    [data.questions.data?.groups]
  );
  const selectedAnswer = useMemo(() => {
    if (!selectedAnswerId) return null;
    return selectedQuestionAnswers.find(answer => answer.id === selectedAnswerId) ?? null;
  }, [selectedAnswerId, selectedQuestionAnswers]);
  const currentAnswerIndex = useMemo(() => {
    if (!selectedAnswerId) return -1;
    return selectedQuestionAnswers.findIndex(answer => answer.id === selectedAnswerId);
  }, [selectedAnswerId, selectedQuestionAnswers]);
  const allQuestionStatuses = useMemo<Array<"not_started" | "in_progress" | "resolved">>(
    () => ["not_started", "in_progress"],
    []
  );
  const questionStatuses = useMemo<Array<"not_started" | "in_progress" | "resolved">>(
    () =>
      questionStatusFilter === "all" ? ["not_started", "in_progress"] : [questionStatusFilter],
    [questionStatusFilter]
  );
  const selectedTodoGroupTitle = useMemo(() => {
    if (todoGroupId == null) return "全部";
    return (
      data.todo.data?.groups.find(item => item.group.id === todoGroupId)?.group.title ?? "当前分组"
    );
  }, [data.todo.data?.groups, todoGroupId]);
  const selectedQuestionGroupTitle = useMemo(() => {
    if (questionGroupId == null) return "全部";
    return (
      data.questions.data?.groups.find(item => item.group.id === questionGroupId)?.group.title ??
      "当前分组"
    );
  }, [data.questions.data?.groups, questionGroupId]);
  const todoRows = useMemo(() => {
    const items = data.todo.data?.items ?? [];
    const byParent = new Map<number | null, TodoItem[]>();
    [...items]
      .sort((left, right) => left.sortIndex - right.sortIndex)
      .forEach(item => {
        const key = item.parentId ?? null;
        byParent.set(key, [...(byParent.get(key) ?? []), item]);
      });
    const ids = new Set(items.map(item => item.id));
    const roots = items
      .filter(item => item.parentId == null || !ids.has(item.parentId))
      .sort((left, right) => left.sortIndex - right.sortIndex);
    const result: Array<{ item: TodoItem; depth: number }> = [];
    const walk = (item: TodoItem, depth: number) => {
      result.push({ item, depth });
      (byParent.get(item.id) ?? []).forEach(child => walk(child, depth + 1));
    };
    roots.forEach(item => walk(item, 0));
    return result;
  }, [data.todo.data?.items]);

  const refreshAfterMutation = () => {
    data.refreshAll();
  };

  useEffect(() => {
    const loadAnswerMetadata = async () => {
      const ids = new Set<number>();
      questionItems.forEach(question => {
        question.answers.forEach(answerId => ids.add(answerId));
      });
      const titles: Record<number, string> = {};
      const statuses: Record<number, AnswerContentStatus> = {};
      await Promise.all(
        Array.from(ids).map(async contentId => {
          const status = await getAnswerContentStatus(contentId);
          titles[contentId] = `答案 #${contentId}`;
          statuses[contentId] = status;
        })
      );
      setAnswerTitles(titles);
      setAnswerStatuses(statuses);
    };
    if (questionItems.length === 0) {
      setAnswerTitles({});
      setAnswerStatuses({});
      return;
    }
    void loadAnswerMetadata();
  }, [questionItems]);

  const handleOpenAnswer = async (questionId: number, answerId: number) => {
    setSelectedQuestionId(questionId);
    const answers = await getQuestionAnswers(questionId);
    setSelectedQuestionAnswers(answers);
    setSelectedAnswerId(
      answers.find(answer => answer.id === answerId)?.id ?? answers[0]?.id ?? null
    );
    setAnswerPreviewVisible(true);
  };

  const handleViewQuestionDetails = (questionId: number) => {
    const question = questionItems.find(item => item.id === questionId);
    if (!question) return;
    setEditQuestionId(questionId);
    setEditQuestionValue(question.questionContent);
    setEditQuestionDescription(question.description ?? DEFAULT_CONTENT);
  };

  const handleUpdateQuestionDetails = async () => {
    if (!editQuestionId || !editQuestionValue.trim()) return;
    await updateQuestion(editQuestionId, editQuestionValue.trim(), editQuestionDescription);
    setEditQuestionId(null);
    setEditQuestionValue("");
    setEditQuestionDescription(DEFAULT_CONTENT);
    data.refreshQuestions();
  };

  const handleRefreshTodo = (nextGroupId = todoGroupId, nextStatus = todoStatus) => {
    data.refreshTodo({ groupId: nextGroupId, status: nextStatus });
  };

  const handleSelectTodoGroup = (groupId: number | null) => {
    setTodoGroupId(groupId);
    handleRefreshTodo(groupId, todoStatus);
  };

  const handleSelectTodoStatus = (status: "pending" | "completed" | "all") => {
    setTodoStatus(status);
    handleRefreshTodo(todoGroupId, status);
  };

  const handleRefreshQuestions = (
    nextGroupId = questionGroupId,
    nextStatuses = questionStatuses
  ) => {
    data.refreshQuestions({
      groupId: nextGroupId,
      statuses: nextStatuses,
    });
  };

  const handleSelectQuestionGroup = (groupId: number | null) => {
    setQuestionGroupId(groupId);
    handleRefreshQuestions(groupId, questionStatuses);
  };

  const handleSelectQuestionStatus = (
    status: "all" | "not_started" | "in_progress" | "resolved"
  ) => {
    const statuses =
      status === "all" ? allQuestionStatuses : ([status] as typeof allQuestionStatuses);
    setQuestionStatusFilter(status);
    handleRefreshQuestions(questionGroupId, statuses);
  };

  const handleDeleteAnswer = async (questionId: number, answerId: number) => {
    await deleteAnswer(questionId, answerId);
    data.refreshQuestions();
    if (selectedQuestionId === questionId) {
      const answers = await getQuestionAnswers(questionId);
      setSelectedQuestionAnswers(answers);
      setSelectedAnswerId(current => {
        if (answers.length === 0) {
          setAnswerPreviewVisible(false);
          return null;
        }
        if (current && answers.some(answer => answer.id === current)) {
          return current;
        }
        return answers[0]?.id ?? null;
      });
    }
  };

  const handleOpenTodoDetails = (item: TodoItem) => {
    useTodoStore.setState(state => ({
      activeGroupId: item.groupId,
      itemsByGroupId: {
        ...state.itemsByGroupId,
        [item.groupId]: [
          item,
          ...(state.itemsByGroupId[item.groupId] ?? []).filter(current => current.id !== item.id),
        ],
      },
    }));
    setActiveTodo(item.id);
    setRightOpen(true);
  };

  const handleStartDeckReview = async (deckId: number) => {
    const queue = await queueReviews({ deckId, limit: 30 });
    if (queue.length === 0) {
      window.alert("这个卡组当前没有需要复习的闪卡");
      void refreshWorkbenchReviewQueue();
      return;
    }
    setReviewModalQueue(queue);
    setReviewingDeckId(deckId);
    setReviewModalOpen(true);
  };

  const handlePrevAnswer = () => {
    if (selectedQuestionAnswers.length === 0) return;
    setSelectedAnswerId(current => {
      const index = selectedQuestionAnswers.findIndex(answer => answer.id === current);
      const nextIndex = index <= 0 ? selectedQuestionAnswers.length - 1 : index - 1;
      return selectedQuestionAnswers[nextIndex]?.id ?? null;
    });
  };

  const handleNextAnswer = () => {
    if (selectedQuestionAnswers.length === 0) return;
    setSelectedAnswerId(current => {
      const index = selectedQuestionAnswers.findIndex(answer => answer.id === current);
      const nextIndex =
        index === -1 || index === selectedQuestionAnswers.length - 1 ? 0 : index + 1;
      return selectedQuestionAnswers[nextIndex]?.id ?? null;
    });
  };

  return (
    <>
      <ResizableAndHideableSidebar
        className={classNames(
          "relative box-border h-full flex-none",
          open && "ml-3 rounded-2xl border shadow-lg",
          open && "border-[var(--th-border)] bg-[var(--th-card-bg)]"
        )}
        width={componentsWidth}
        open={open}
        onWidthChange={setComponentsWidth}
        resizeHandleSide="left"
        minWidth={320}
        maxWidth={560}
        disableResize={!open}
        handleOffset={9}
      >
        <div className="h-full overflow-hidden rounded-2xl">
          <div className="flex h-full flex-col p-3 text-slate-900 dark:text-slate-100">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--th-accent-soft)] text-[var(--th-active-text)]">
                  <Component size={17} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">组件工作台</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {totalCount} 项待处理
                  </div>
                </div>
              </div>
            </div>

            <div className="components-workbench-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pl-1 pr-4">
              <Section title="协作共享">
                <CollaborationPanel />
              </Section>
              <Section
                title="临期闪念"
                count={data.cards.data?.total ?? 0}
                action={
                  data.cards.loading ? (
                    <Loader2 size={14} className="animate-spin text-slate-400" />
                  ) : null
                }
              >
                {data.cards.error && (
                  <div className="mb-2 text-xs text-rose-500">{data.cards.error}</div>
                )}
                {dueCards.length === 0 && !data.cards.loading ? (
                  <EmptyState text="暂无临期闪念卡片" />
                ) : (
                  <div className="space-y-2">
                    {dueCards.map(({ card, expiresAt }) => {
                      const remainingMs = expiresAt - now;
                      const progress = Math.max(
                        0,
                        Math.min(100, ((ONE_MONTH - remainingMs) / ONE_MONTH) * 100)
                      );
                      const title = slateToPlainText(card.content) || `卡片 #${card.id}`;
                      return (
                        <div
                          key={card.id}
                          className="hover:border-[var(--th-accent)]/40 hover:bg-[var(--th-accent)]/5 group w-full rounded-xl border border-slate-900/10 bg-white/70 p-2.5 text-left transition dark:border-white/10 dark:bg-zinc-950/35"
                        >
                          <div className="flex items-start gap-2">
                            <Sparkles
                              size={14}
                              className="mt-0.5 shrink-0 text-[var(--th-active-text)]"
                            />
                            <button
                              type="button"
                              onClick={() => setPreviewCardId(card.id)}
                              className="focus-visible:ring-[var(--th-accent)]/40 min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2"
                            >
                              <div className="line-clamp-2 text-xs font-medium text-slate-900 dark:text-slate-100">
                                {title}
                              </div>
                              <div
                                className={classNames(
                                  "mt-1 text-[11px]",
                                  remainingMs <= 24 * 60 * 60 * 1000
                                    ? "text-rose-500"
                                    : "text-slate-500 dark:text-slate-400"
                                )}
                              >
                                {formatRemaining(remainingMs)}
                              </div>
                              <div className="bg-slate-900/8 mt-2 h-1 overflow-hidden rounded-full dark:bg-white/10">
                                <div
                                  className={classNames(
                                    "h-full rounded-full",
                                    progress > 90 ? "bg-rose-500" : "bg-[var(--th-accent)]"
                                  )}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                modal.confirm({
                                  title: "确认删除",
                                  content: "确认删除这张闪念卡片吗？该操作不可撤销。",
                                  okText: "删除",
                                  cancelText: "取消",
                                  okButtonProps: { danger: true },
                                  onOk: async () => {
                                    await deleteCard(card.id);
                                    data.refreshCards();
                                  },
                                });
                              }}
                              className={iconButtonClass}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {data.cards.data?.nextCursor != null && (
                      <LoadMoreButton
                        loading={data.cards.loadingMore}
                        onClick={data.loadMoreCards}
                      />
                    )}
                  </div>
                )}
              </Section>

              <Section title="闪卡复习" count={dueFlashcards}>
                <FlashcardReviewDeckList
                  reviewQueue={workbenchReviewQueue}
                  decks={flashcardDecks}
                  loading={loadingReview}
                  maxDecks={4}
                  onRefresh={async () => {
                    const queue = await refreshWorkbenchReviewQueue();
                    if (queue.length === 0) {
                      window.alert("当前没有需要复习的闪卡");
                    }
                  }}
                  onStartDeckReview={handleStartDeckReview}
                />
              </Section>

              <Section title="TODO" count={pendingTodos}>
                {data.todo.error && (
                  <div className="mb-2 text-xs text-rose-500">{data.todo.error}</div>
                )}
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <FilterChip
                    active={todoGroupId == null}
                    onClick={() => handleSelectTodoGroup(null)}
                  >
                    全部分组 {pendingTodos}
                  </FilterChip>
                  {(data.todo.data?.groups ?? []).slice(0, 5).map(group => (
                    <FilterChip
                      key={group.group.id}
                      active={todoGroupId === group.group.id}
                      onClick={() => handleSelectTodoGroup(group.group.id)}
                    >
                      {group.group.title} {group.pending}
                    </FilterChip>
                  ))}
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <FilterChip
                    active={todoStatus === "pending"}
                    onClick={() => handleSelectTodoStatus("pending")}
                  >
                    未完成
                  </FilterChip>
                  <FilterChip
                    active={todoStatus === "all"}
                    onClick={() => handleSelectTodoStatus("all")}
                  >
                    全部状态
                  </FilterChip>
                  <FilterChip
                    active={todoStatus === "completed"}
                    onClick={() => handleSelectTodoStatus("completed")}
                  >
                    已完成
                  </FilterChip>
                </div>
                <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                  当前：{selectedTodoGroupTitle}，保留父子层级
                </div>
                {(data.todo.data?.items ?? []).length === 0 && !data.todo.loading ? (
                  <EmptyState text="暂无未完成任务" />
                ) : (
                  <div className="space-y-2">
                    {todoRows.map(({ item, depth }) => (
                      <TodoRow
                        key={item.id}
                        item={item}
                        depth={depth}
                        onEdit={handleOpenTodoDetails}
                        onChanged={refreshAfterMutation}
                      />
                    ))}
                    {data.todo.data?.nextCursor != null && (
                      <LoadMoreButton loading={data.todo.loadingMore} onClick={data.loadMoreTodo} />
                    )}
                  </div>
                )}
              </Section>

              <Section title="问题管理" count={pendingQuestions}>
                {data.questions.error && (
                  <div className="mb-2 text-xs text-rose-500">{data.questions.error}</div>
                )}
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <FilterChip
                    active={questionGroupId == null}
                    onClick={() => handleSelectQuestionGroup(null)}
                  >
                    全部分组 {pendingQuestions}
                  </FilterChip>
                  {(data.questions.data?.groups ?? []).slice(0, 5).map(group => (
                    <FilterChip
                      key={group.group.id}
                      active={questionGroupId === group.group.id}
                      onClick={() => handleSelectQuestionGroup(group.group.id)}
                    >
                      {group.group.title} {group.notStarted + group.inProgress}
                    </FilterChip>
                  ))}
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <FilterChip
                    active={questionStatusFilter === "all"}
                    onClick={() => handleSelectQuestionStatus("all")}
                  >
                    全部
                  </FilterChip>
                  <FilterChip
                    active={questionStatusFilter === "not_started"}
                    onClick={() => handleSelectQuestionStatus("not_started")}
                  >
                    未开始
                  </FilterChip>
                  <FilterChip
                    active={questionStatusFilter === "in_progress"}
                    onClick={() => handleSelectQuestionStatus("in_progress")}
                  >
                    进行中
                  </FilterChip>
                  <FilterChip
                    active={questionStatusFilter === "resolved"}
                    onClick={() => handleSelectQuestionStatus("resolved")}
                  >
                    已解决
                  </FilterChip>
                </div>
                <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                  当前：{selectedQuestionGroupTitle}
                </div>
                {(data.questions.data?.items ?? []).length === 0 && !data.questions.loading ? (
                  <EmptyState text="暂无待处理问题" />
                ) : (
                  <div className="-mx-2">
                    {questionItems.map((item, index) => (
                      <QuestionItem
                        key={item.id}
                        editMode="modal"
                        question={item}
                        showBorder={index !== questionItems.length - 1}
                        groups={questionGroups}
                        allQuestionIds={questionItems.map(question => question.id)}
                        answerTitles={answerTitles}
                        answerStatuses={answerStatuses}
                        onUpdateTitle={(id, title) => {
                          void updateQuestion(id, title).then(() => data.refreshQuestions());
                        }}
                        onOpenNewAnswer={id => {
                          setSelectedQuestionId(id);
                          setNewAnswerVisible(true);
                        }}
                        onOpenSelectAnswer={id => {
                          setSelectedQuestionId(id);
                          setContentSelectorVisible(true);
                        }}
                        onMoveToGroup={async (id, toGroupId) => {
                          await moveQuestionToGroup(id, toGroupId);
                          data.refreshQuestions();
                        }}
                        onDelete={async id => {
                          if (!window.confirm("删除这个问题？")) return;
                          await deleteQuestion(id);
                          data.refreshQuestions();
                        }}
                        onReorder={() => undefined}
                        onOpenAnswer={handleOpenAnswer}
                        onDeleteAnswer={handleDeleteAnswer}
                        onUpdateStatus={async (id, status) => {
                          await updateQuestionStatus(id, status);
                          data.refreshQuestions();
                        }}
                        onViewDetails={handleViewQuestionDetails}
                      />
                    ))}
                    {data.questions.data?.nextCursor != null && (
                      <LoadMoreButton
                        loading={data.questions.loadingMore}
                        onClick={data.loadMoreQuestions}
                      />
                    )}
                  </div>
                )}
              </Section>
            </div>
          </div>
        </div>
      </ResizableAndHideableSidebar>

      <CardPreview
        cardId={previewCardId}
        visible={previewCardId !== undefined}
        onClose={() => {
          setPreviewCardId(undefined);
          data.refreshCards();
        }}
        onGoToDetail={() => {
          setPreviewCardId(undefined);
          data.refreshCards();
        }}
      />

      <ReviewModal
        open={reviewModalOpen}
        reviewQueue={reviewModalQueue}
        onSubmitReview={async (cardId, rating) => {
          const card = reviewModalQueue.find(item => item.id === cardId);
          await submitReview({
            cardId,
            deckId: card?.deckId ?? reviewingDeckId ?? selectedReviewDeckId ?? 0,
            rating,
          });
          if (reviewingDeckId != null) {
            const queue = await queueReviews({
              deckId: reviewingDeckId,
              limit: 30,
            });
            setReviewModalQueue(queue);
            void refreshWorkbenchReviewQueue();
            return;
          }
          const queue = await refreshWorkbenchReviewQueue();
          setReviewModalQueue(queue);
        }}
        onClose={() => {
          setReviewModalOpen(false);
          setReviewModalQueue([]);
          setReviewingDeckId(null);
          void refreshWorkbenchReviewQueue();
        }}
      />

      <CustomModal
        open={editQuestionId != null}
        onCancel={() => {
          setEditQuestionId(null);
          setEditQuestionValue("");
          setEditQuestionDescription(DEFAULT_CONTENT);
        }}
        width={800}
        title="编辑问题"
        subtitle="修改问题内容和描述"
        closeOnEscape={false}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditQuestionId(null);
                setEditQuestionValue("");
                setEditQuestionDescription(DEFAULT_CONTENT);
              }}
              className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleUpdateQuestionDetails}
              disabled={!editQuestionValue.trim()}
              className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
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
              onChange={event => setEditQuestionValue(event.target.value)}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition placeholder:text-gray-400 focus:border-blue-500 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
              问题描述
            </label>
            <div className="rounded-xl border border-gray-200 bg-gray-50 shadow-inner transition focus-within:border-blue-500 dark:border-slate-700 dark:bg-zinc-950">
              <Editor
                key={`workbench-edit-question-${editQuestionId}`}
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
          data.refreshQuestions();
        }}
      />

      <ContentSelectorModal
        open={contentSelectorVisible}
        onCancel={() => setContentSelectorVisible(false)}
        onSelect={async (item: SearchResult | SearchResult[]) => {
          if (!selectedQuestionId) return;
          const items = Array.isArray(item) ? item : [item];
          for (const selected of items) {
            await addAnswer(
              selectedQuestionId,
              {
                contentId: selected.contentId,
                content: [],
              },
              true
            );
          }
          setContentSelectorVisible(false);
          data.refreshQuestions();
        }}
        contentType={["card", "article", "project-item", "document-item", "diary-daily"]}
        extensions={dynamicExtensions}
      />

      <AnswerModal
        visible={answerPreviewVisible}
        selectedAnswer={selectedAnswer}
        extensions={dynamicExtensions}
        onClose={() => {
          setAnswerPreviewVisible(false);
          setSelectedAnswerId(null);
          setSelectedQuestionAnswers([]);
        }}
        onAnswerChange={() => data.refreshQuestions()}
        readOnly={false}
        currentIndex={currentAnswerIndex}
        total={selectedQuestionAnswers.length}
        onPrev={handlePrevAnswer}
        onNext={handleNextAnswer}
      />

      <TodoDetailsPanel />
    </>
  );
});

RightComponentsSidebar.displayName = "RightComponentsSidebar";

export default RightComponentsSidebar;
