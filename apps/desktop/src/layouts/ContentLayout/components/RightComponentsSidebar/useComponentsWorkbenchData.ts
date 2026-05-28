import { useCallback, useEffect, useRef, useState } from "react";
import {
  listExpiringTemporaryCards,
  listQuestionPreview,
  listTodoPreview,
} from "@/commands/components-workbench";
import type {
  WorkbenchExpiringCardsResponse,
  WorkbenchQuestionPreviewRequest,
  WorkbenchQuestionPreviewResponse,
  WorkbenchTodoPreviewRequest,
  WorkbenchTodoPreviewResponse,
} from "@/types";

const PAGE_SIZE = 8;

type AsyncSection<T> = {
  data: T | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "加载失败";

const mergeById = <T extends { id: number }>(current: T[], next: T[]) => {
  const map = new Map<number, T>();
  [...current, ...next].forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
};

export const useComponentsWorkbenchData = (visible: boolean) => {
  const todoRequestRef = useRef<WorkbenchTodoPreviewRequest>({
    status: "pending",
  });
  const questionRequestRef = useRef<WorkbenchQuestionPreviewRequest>({
    statuses: ["not_started", "in_progress"],
  });
  const [cards, setCards] = useState<
    AsyncSection<WorkbenchExpiringCardsResponse>
  >({
    data: null,
    loading: false,
    loadingMore: false,
    error: null,
  });
  const [todo, setTodo] = useState<AsyncSection<WorkbenchTodoPreviewResponse>>({
    data: null,
    loading: false,
    loadingMore: false,
    error: null,
  });
  const [questions, setQuestions] = useState<
    AsyncSection<WorkbenchQuestionPreviewResponse>
  >({
    data: null,
    loading: false,
    loadingMore: false,
    error: null,
  });

  const refreshCards = useCallback(async () => {
    setCards((state) => ({ ...state, loading: true, error: null }));
    try {
      const data = await listExpiringTemporaryCards({ limit: PAGE_SIZE });
      setCards({ data, loading: false, loadingMore: false, error: null });
    } catch (error) {
      setCards((state) => ({
        ...state,
        loading: false,
        error: getErrorMessage(error),
      }));
    }
  }, []);

  const loadMoreCards = useCallback(async () => {
    if (!cards.data?.nextCursor || cards.loadingMore) return;
    setCards((state) => ({ ...state, loadingMore: true, error: null }));
    try {
      const next = await listExpiringTemporaryCards({
        limit: PAGE_SIZE,
        cursor: cards.data.nextCursor,
      });
      setCards((state) => ({
        data: {
          items: [...(state.data?.items ?? []), ...next.items],
          nextCursor: next.nextCursor,
          total: next.total,
        },
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error) {
      setCards((state) => ({
        ...state,
        loadingMore: false,
        error: getErrorMessage(error),
      }));
    }
  }, [cards.data?.nextCursor, cards.loadingMore]);

  const refreshTodo = useCallback(
    async (payload: WorkbenchTodoPreviewRequest = {}) => {
      const request = {
        ...todoRequestRef.current,
        ...payload,
        cursor: undefined,
      };
      todoRequestRef.current = request;
      setTodo((state) => ({ ...state, loading: true, error: null }));
      try {
        const data = await listTodoPreview({ limit: PAGE_SIZE, ...request });
        setTodo({ data, loading: false, loadingMore: false, error: null });
      } catch (error) {
        setTodo((state) => ({
          ...state,
          loading: false,
          error: getErrorMessage(error),
        }));
      }
    },
    [],
  );

  const loadMoreTodo = useCallback(async () => {
    if (!todo.data?.nextCursor || todo.loadingMore) return;
    setTodo((state) => ({ ...state, loadingMore: true, error: null }));
    try {
      const next = await listTodoPreview({
        ...todoRequestRef.current,
        limit: PAGE_SIZE,
        cursor: todo.data.nextCursor,
      });
      setTodo((state) => ({
        data: {
          ...next,
          items: mergeById(state.data?.items ?? [], next.items),
        },
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error) {
      setTodo((state) => ({
        ...state,
        loadingMore: false,
        error: getErrorMessage(error),
      }));
    }
  }, [todo.data?.nextCursor, todo.loadingMore]);

  const refreshQuestions = useCallback(
    async (payload: WorkbenchQuestionPreviewRequest = {}) => {
      const request = {
        ...questionRequestRef.current,
        ...payload,
        cursor: undefined,
        statuses: payload.statuses ??
          questionRequestRef.current.statuses ?? ["not_started", "in_progress"],
      };
      questionRequestRef.current = request;
      setQuestions((state) => ({ ...state, loading: true, error: null }));
      try {
        const data = await listQuestionPreview({
          limit: PAGE_SIZE,
          ...request,
        });
        setQuestions({
          data,
          loading: false,
          loadingMore: false,
          error: null,
        });
      } catch (error) {
        setQuestions((state) => ({
          ...state,
          loading: false,
          error: getErrorMessage(error),
        }));
      }
    },
    [],
  );

  const loadMoreQuestions = useCallback(async () => {
    if (!questions.data?.nextCursor || questions.loadingMore) return;
    setQuestions((state) => ({ ...state, loadingMore: true, error: null }));
    try {
      const next = await listQuestionPreview({
        ...questionRequestRef.current,
        limit: PAGE_SIZE,
        cursor: questions.data.nextCursor,
      });
      setQuestions((state) => ({
        data: {
          ...next,
          items: mergeById(state.data?.items ?? [], next.items),
        },
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error) {
      setQuestions((state) => ({
        ...state,
        loadingMore: false,
        error: getErrorMessage(error),
      }));
    }
  }, [questions.data?.nextCursor, questions.loadingMore]);

  const refreshAll = useCallback(() => {
    void refreshCards();
    void refreshTodo();
    void refreshQuestions();
  }, [refreshCards, refreshQuestions, refreshTodo]);

  useEffect(() => {
    if (visible) refreshAll();
  }, [refreshAll, visible]);

  return {
    cards,
    todo,
    questions,
    refreshAll,
    refreshCards,
    refreshTodo,
    refreshQuestions,
    loadMoreCards,
    loadMoreTodo,
    loadMoreQuestions,
  };
};
