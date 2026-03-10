import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IQuestion, IAnswer } from "@/types";
import { Descendant } from "slate";
import {
  listQuestionGroups,
  getQuestionGroupStats,
  getDefaultQuestionGroup,
  createQuestionGroup as apiCreateGroup,
  updateQuestionGroup as apiUpdateGroup,
  deleteQuestionGroup as apiDeleteGroup,
  reorderQuestionGroups as apiReorderGroups,
} from "@/commands/question-group";
import {
  listQuestionsByGroup,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  moveQuestionToGroup,
  addAnswer,
  createAnswer,
  deleteAnswer,
  getQuestionById,
  updateQuestionStatus as apiUpdateQuestionStatus,
} from "@/commands/question";
import {
  QUESTION_MUTATION_ACTIONS,
  type QuestionMutationEvent,
} from "@/mcp/question/mutation";
import { subscribeQuestionMutationEvent } from "@/mcp/question/events";

export type QuestionFilter =
  | "all"
  | "answered"
  | "unanswered"
  | "not_started"
  | "in_progress"
  | "resolved";

interface QuestionGroup {
  id: number;
  title: string;
  color?: string;
  isDefault: boolean;
}

interface GroupStats {
  total: number;
  answered: number;
  unanswered: number;
}

const matchesQuestionFilter = (question: IQuestion, filter: QuestionFilter) => {
  switch (filter) {
    case "answered":
      return question.answers.length > 0;
    case "unanswered":
      return question.answers.length === 0;
    case "not_started":
      return question.status === "not_started";
    case "in_progress":
      return question.status === "in_progress";
    case "resolved":
      return question.status === "resolved";
    case "all":
    default:
      return true;
  }
};

const sortQuestionsForGroup = (questions: IQuestion[]) =>
  [...questions].sort((left, right) => {
    if (left.sortIndex !== right.sortIndex) {
      return left.sortIndex - right.sortIndex;
    }
    return left.createTime - right.createTime;
  });

interface QuestionState {
  leftOpen: boolean;
  leftWidth: number;

  groups: QuestionGroup[];
  groupStats: Record<number, GroupStats>;
  activeGroupId: number | null;
  filter: QuestionFilter;
  searchQuery: string;

  itemsByGroup: Record<number, IQuestion[]>;
  loading: { groups: boolean; items: boolean };

  setLeftOpen: (open: boolean) => void;
  setLeftWidth: (w: number) => void;
  setActiveGroup: (id: number | null) => void;
  setFilter: (f: QuestionFilter) => void;
  setSearchQuery: (q: string) => void;

  loadGroups: () => Promise<void>;
  loadGroupStats: () => Promise<void>;
  createGroup: (payload: { title: string; color?: string }) => Promise<void>;
  updateGroup: (payload: {
    id: number;
    title?: string;
    color?: string;
  }) => Promise<void>;
  deleteGroup: (groupId: number) => Promise<void>;
  reorderGroups: (orderedIds: number[]) => Promise<void>;
  loadItems: (groupId: number) => Promise<void>;

  createQuestion: (payload: {
    questionContent: string;
    groupId: number;
    description: Descendant[];
  }) => Promise<IQuestion>;
  updateQuestion: (payload: {
    id: number;
    questionContent: string;
    description?: Descendant[];
  }) => Promise<void>;
  deleteQuestion: (id: number) => Promise<void>;
  reorderQuestions: (orderedIds: number[]) => Promise<void>;
  moveToGroup: (id: number, toGroupId: number) => Promise<void>;

  addAnswerNew: (questionId: number, content: Descendant[]) => Promise<void>;
  addAnswerSelect: (questionId: number, contentId: number) => Promise<void>;
  deleteAnswer: (questionId: number, answerId: number) => Promise<void>;
  updateQuestionStatus: (
    id: number,
    status: "not_started" | "in_progress" | "resolved",
  ) => Promise<void>;
}

export const useQuestionStore = create<QuestionState>()(
  devtools((set, get) => ({
    leftOpen: true,
    leftWidth: 240,

    groups: [],
    groupStats: {},
    activeGroupId: null,
    filter: "all",
    searchQuery: "",

    itemsByGroup: {},
    loading: { groups: false, items: false },

    setLeftOpen: (open) => set({ leftOpen: open }),
    setLeftWidth: (w) => set({ leftWidth: w }),
    setActiveGroup: (id) => set({ activeGroupId: id }),
    setFilter: (f) => set({ filter: f }),
    setSearchQuery: (q) => set({ searchQuery: q }),

    loadGroups: async () => {
      set((s) => ({ loading: { ...s.loading, groups: true } }));
      const groupDTOs = await listQuestionGroups();
      const groups: QuestionGroup[] = groupDTOs.map((dto) => ({
        id: dto.id,
        title: dto.title,
        color: dto.color,
        isDefault: dto.isDefault,
      }));
      // 默认组回退
      let active = get().activeGroupId;
      const hasActiveGroup =
        active != null && groups.some((group) => group.id === active);
      if (!hasActiveGroup && groups.length > 0) {
        const def = await getDefaultQuestionGroup();
        active = def?.id ?? groups[0].id;
      }
      set({
        groups,
        activeGroupId: active ?? null,
        loading: { ...get().loading, groups: false },
      });
    },

    loadGroupStats: async () => {
      const stats = await getQuestionGroupStats();
      const groupStats: Record<number, GroupStats> = {};
      stats.forEach((s) => {
        groupStats[s.groupId] = {
          total: s.total,
          answered: s.answered,
          unanswered: s.unanswered,
        };
      });
      set({ groupStats });
    },

    createGroup: async (payload) => {
      const dto = await apiCreateGroup({
        title: payload.title,
        color: payload.color,
      });
      if (dto) {
        const newGroup: QuestionGroup = {
          id: dto.id,
          title: dto.title,
          color: dto.color,
          isDefault: dto.isDefault,
        };
        set((s) => ({
          groups: [...s.groups, newGroup],
        }));
      }
    },

    updateGroup: async (payload) => {
      const dto = await apiUpdateGroup(payload);
      const updatedGroup: QuestionGroup = {
        id: dto.id,
        title: dto.title,
        color: dto.color,
        isDefault: dto.isDefault,
      };
      set((s) => ({
        groups: s.groups.map((x) => (x.id === dto.id ? updatedGroup : x)),
      }));
    },

    deleteGroup: async (groupId) => {
      await apiDeleteGroup(groupId);
      await get().loadGroups();
      // 如果删除的是当前激活的分组，切换到默认分组
      if (get().activeGroupId === groupId) {
        const defaultGroup = get().groups.find((g) => g.isDefault);
        if (defaultGroup) {
          set({ activeGroupId: defaultGroup.id });
        }
      }
    },

    reorderGroups: async (orderedIds) => {
      await apiReorderGroups(orderedIds);
      const idToIndex = new Map<number, number>();
      orderedIds.forEach((id, index) => idToIndex.set(id, index));
      set((s) => ({
        groups: [...s.groups].sort((a, b) => {
          const indexA = idToIndex.get(a.id) ?? 0;
          const indexB = idToIndex.get(b.id) ?? 0;
          return indexA - indexB;
        }),
      }));
    },

    loadItems: async (groupId) => {
      const { filter } = get();
      set((s) => ({ loading: { ...s.loading, items: true } }));
      const items = await listQuestionsByGroup({
        groupId,
        filter,
        search: "", // 搜索在前端处理，避免频繁请求
      });
      set((s) => ({
        itemsByGroup: { ...s.itemsByGroup, [groupId]: items },
        loading: { ...s.loading, items: false },
      }));
    },

    createQuestion: async ({ questionContent, groupId, description }) => {
      const q = await createQuestion(questionContent, groupId, description);
      set((s) => ({
        itemsByGroup: {
          ...s.itemsByGroup,
          [q.groupId]: [...(s.itemsByGroup[q.groupId] || []), q],
        },
      }));
      await get().loadGroupStats();
      return q;
    },

    updateQuestion: async ({ id, questionContent, description }) => {
      const q = await updateQuestion(id, questionContent, description);
      set((s) => ({
        itemsByGroup: {
          ...s.itemsByGroup,
          [q.groupId]: (s.itemsByGroup[q.groupId] || []).map((x) =>
            x.id === q.id ? q : x,
          ),
        },
      }));
    },

    deleteQuestion: async (id) => {
      await deleteQuestion(id);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },

    reorderQuestions: async (orderedIds) => {
      await reorderQuestions(orderedIds);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
    },

    moveToGroup: async (id, toGroupId) => {
      const q = await moveQuestionToGroup(id, toGroupId);
      // 重新加载两个组
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadItems(q.groupId);
      await get().loadGroupStats();
    },

    addAnswerNew: async (questionId, content) => {
      const ans: IAnswer = await createAnswer(content);
      await addAnswer(
        questionId,
        { contentId: ans.id, content: ans.content },
        false,
      );
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },

    addAnswerSelect: async (questionId, contentId) => {
      await addAnswer(questionId, { contentId, content: [] }, true);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },

    deleteAnswer: async (questionId, answerId) => {
      await deleteAnswer(questionId, answerId);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },

    updateQuestionStatus: async (id, status) => {
      await apiUpdateQuestionStatus(id, status);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },
  })),
);

const applyRemoteQuestionPatch = (
  event: QuestionMutationEvent,
  question: IQuestion | null,
) => {
  const state = useQuestionStore.getState();
  const filter = state.filter;

  useQuestionStore.setState((current) => {
    const nextItemsByGroup = { ...current.itemsByGroup };
    const loadedGroupIds = new Set(Object.keys(nextItemsByGroup).map(Number));
    const removeQuestionFromGroup = (
      groupId?: number | null,
      questionId?: number,
    ) => {
      if (!groupId || !questionId || !loadedGroupIds.has(groupId)) {
        return;
      }
      nextItemsByGroup[groupId] = (nextItemsByGroup[groupId] || []).filter(
        (item) => item.id !== questionId,
      );
    };

    if (event.action === QUESTION_MUTATION_ACTIONS.DELETE_QUESTION) {
      removeQuestionFromGroup(
        event.groupId,
        event.questionId || event.entityId,
      );
      if (event.previousGroupId && event.previousGroupId !== event.groupId) {
        removeQuestionFromGroup(
          event.previousGroupId,
          event.questionId || event.entityId,
        );
      }
      return { itemsByGroup: nextItemsByGroup };
    }

    if (!question) {
      return {};
    }

    const targetGroupId = question.groupId;
    const previousGroupId = event.previousGroupId;

    if (previousGroupId && previousGroupId !== targetGroupId) {
      removeQuestionFromGroup(previousGroupId, question.id);
    }

    if (loadedGroupIds.has(targetGroupId)) {
      const currentGroupItems = nextItemsByGroup[targetGroupId] || [];
      const filteredItems = currentGroupItems.filter(
        (item) => item.id !== question.id,
      );
      if (matchesQuestionFilter(question, filter)) {
        nextItemsByGroup[targetGroupId] = sortQuestionsForGroup([
          ...filteredItems,
          question,
        ]);
      } else {
        nextItemsByGroup[targetGroupId] = filteredItems;
      }
    }

    return { itemsByGroup: nextItemsByGroup };
  });
};

let questionMutationSyncInitialized = false;

const initializeQuestionMutationSync = () => {
  if (questionMutationSyncInitialized) {
    return;
  }
  questionMutationSyncInitialized = true;

  subscribeQuestionMutationEvent((event) => {
    if (event.source !== "question-mcp") {
      return;
    }

    const store = useQuestionStore.getState();

    if (
      event.entityType === "question-group" ||
      event.action === QUESTION_MUTATION_ACTIONS.REORDER_GROUPS
    ) {
      void store.loadGroups();
      void store.loadGroupStats();
      return;
    }

    if (event.action === QUESTION_MUTATION_ACTIONS.REORDER_QUESTIONS) {
      if (event.groupId != null && store.itemsByGroup[event.groupId]) {
        void store.loadItems(event.groupId);
      }
      void store.loadGroupStats();
      return;
    }

    if (!event.questionId && !event.entityId) {
      void store.loadGroupStats();
      return;
    }

    const questionId = event.questionId ?? event.entityId!;
    void getQuestionById(questionId)
      .then((question) => {
        applyRemoteQuestionPatch(event, question);
      })
      .finally(() => {
        void store.loadGroupStats();
      });
  });
};

initializeQuestionMutationSync();
