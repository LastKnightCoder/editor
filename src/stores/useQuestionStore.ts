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
} from "@/commands/question";

export type QuestionFilter = "all" | "answered" | "unanswered";

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
  }) => Promise<IQuestion>;
  updateQuestion: (payload: {
    id: number;
    questionContent: string;
  }) => Promise<void>;
  deleteQuestion: (id: number) => Promise<void>;
  reorderQuestions: (orderedIds: number[]) => Promise<void>;
  moveToGroup: (id: number, toGroupId: number) => Promise<void>;

  addAnswerNew: (questionId: number, content: Descendant[]) => Promise<void>;
  addAnswerSelect: (questionId: number, contentId: number) => Promise<void>;
  deleteAnswer: (questionId: number, answerId: number) => Promise<void>;
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
      if (active == null && groups.length > 0) {
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
      const { filter, searchQuery } = get();
      set((s) => ({ loading: { ...s.loading, items: true } }));
      const items = await listQuestionsByGroup({
        groupId,
        filter,
        search: searchQuery,
      });
      set((s) => ({
        itemsByGroup: { ...s.itemsByGroup, [groupId]: items },
        loading: { ...s.loading, items: false },
      }));
    },

    createQuestion: async ({ questionContent, groupId }) => {
      const q = await createQuestion(questionContent, groupId);
      set((s) => ({
        itemsByGroup: {
          ...s.itemsByGroup,
          [q.groupId]: [...(s.itemsByGroup[q.groupId] || []), q],
        },
      }));
      await get().loadGroupStats();
      return q;
    },

    updateQuestion: async ({ id, questionContent }) => {
      const q = await updateQuestion(id, questionContent);
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
  })),
);
