import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  VLQuizSet,
  VLQuizItem,
  VLQuizRecord,
  CreateVLQuizSetInput,
  UpdateVLQuizSetInput,
  CreateVLQuizItemInput,
  UpdateVLQuizItemInput,
  CreateVLQuizRecordInput,
  QuizAnswerRecord,
  QuizTestStatus,
} from "@/types";
import {
  listVLQuizSets,
  getVLQuizSet,
  createVLQuizSet,
  updateVLQuizSet,
  deleteVLQuizSet,
  listVLQuizItems,
  createVLQuizItemsBatch,
  updateVLQuizItem,
  deleteVLQuizItem,
  listVLQuizRecords,
  createVLQuizRecord,
  deleteVLQuizRecord,
} from "@/commands/vl-quiz";

interface QuizTestSession {
  quizSetId: number;
  items: VLQuizItem[];
  currentIndex: number;
  answers: Record<number, QuizAnswerRecord>;
  startTime: number;
  status: QuizTestStatus;
}

interface VLQuizState {
  // 测验集列表（按项目）
  quizSetsByProject: Record<number, VLQuizSet[]>;
  // 测验题列表（按测验集）
  itemsByQuizSet: Record<number, VLQuizItem[]>;
  // 测验记录（按测验集）
  recordsByQuizSet: Record<number, VLQuizRecord[]>;
  // 当前项目 ID
  currentProjectId: number | null;
  // 当前选中的测验集
  activeQuizSetId: number | null;
  // 加载状态
  loadingQuizSets: boolean;
  loadingItems: boolean;
  loadingRecords: boolean;
  // 测验会话
  testSession: QuizTestSession | null;
}

interface VLQuizActions {
  // 初始化
  setCurrentProject: (projectId: number) => void;
  // 测验集操作
  fetchQuizSets: (projectId: number) => Promise<VLQuizSet[]>;
  createQuizSet: (payload: CreateVLQuizSetInput) => Promise<VLQuizSet>;
  updateQuizSet: (payload: UpdateVLQuizSetInput) => Promise<VLQuizSet | null>;
  deleteQuizSet: (id: number) => Promise<boolean>;
  selectQuizSet: (id: number | null) => void;
  getActiveQuizSet: () => VLQuizSet | null;
  // 测验题操作
  fetchItems: (quizSetId: number) => Promise<VLQuizItem[]>;
  createItemsBatch: (items: CreateVLQuizItemInput[]) => Promise<VLQuizItem[]>;
  updateItem: (payload: UpdateVLQuizItemInput) => Promise<VLQuizItem | null>;
  deleteItem: (id: number) => Promise<boolean>;
  getItems: (quizSetId: number) => VLQuizItem[];
  // 测验记录操作
  fetchRecords: (params: {
    quizSetId?: number;
    projectId?: number;
  }) => Promise<VLQuizRecord[]>;
  createRecord: (payload: CreateVLQuizRecordInput) => Promise<VLQuizRecord>;
  deleteRecord: (id: number) => Promise<boolean>;
  getRecords: (quizSetId: number) => VLQuizRecord[];
  // 测验会话操作
  startTest: (quizSetId: number) => Promise<void>;
  submitAnswer: (itemId: number, answer: QuizAnswerRecord) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  goToQuestion: (index: number) => void;
  finishTest: () => Promise<VLQuizRecord | null>;
  cancelTest: () => void;
  getTestProgress: () => {
    current: number;
    total: number;
    answered: number;
  } | null;
  // 重置
  reset: () => void;
}

const initialState: VLQuizState = {
  quizSetsByProject: {},
  itemsByQuizSet: {},
  recordsByQuizSet: {},
  currentProjectId: null,
  activeQuizSetId: null,
  loadingQuizSets: false,
  loadingItems: false,
  loadingRecords: false,
  testSession: null,
};

const useVLQuizStore = create<VLQuizState & VLQuizActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCurrentProject: (projectId) => {
        set({ currentProjectId: projectId });
      },

      fetchQuizSets: async (projectId) => {
        set({ loadingQuizSets: true });
        try {
          const quizSets = await listVLQuizSets(projectId);
          set((state) => ({
            quizSetsByProject: {
              ...state.quizSetsByProject,
              [projectId]: quizSets,
            },
          }));
          return quizSets;
        } catch (error) {
          console.error("[VLQuizStore] fetchQuizSets failed", error);
          return [];
        } finally {
          set({ loadingQuizSets: false });
        }
      },

      createQuizSet: async (payload) => {
        const quizSet = await createVLQuizSet(payload);
        set((state) => {
          const currentSets = state.quizSetsByProject[payload.projectId] ?? [];
          return {
            quizSetsByProject: {
              ...state.quizSetsByProject,
              [payload.projectId]: [quizSet, ...currentSets],
            },
            activeQuizSetId: quizSet.id,
          };
        });
        return quizSet;
      },

      updateQuizSet: async (payload) => {
        const quizSet = await updateVLQuizSet(payload);
        if (!quizSet) return null;

        set((state) => {
          const projectId = get().currentProjectId;
          if (!projectId) return state;

          const currentSets = state.quizSetsByProject[projectId] ?? [];
          return {
            quizSetsByProject: {
              ...state.quizSetsByProject,
              [projectId]: currentSets.map((s) =>
                s.id === quizSet.id ? quizSet : s,
              ),
            },
          };
        });
        return quizSet;
      },

      deleteQuizSet: async (id) => {
        const success = await deleteVLQuizSet(id);
        if (!success) return false;

        set((state) => {
          const projectId = get().currentProjectId;
          if (!projectId) return state;

          const currentSets = state.quizSetsByProject[projectId] ?? [];
          const { [id]: _, ...restItems } = state.itemsByQuizSet;
          const { [id]: __, ...restRecords } = state.recordsByQuizSet;

          return {
            quizSetsByProject: {
              ...state.quizSetsByProject,
              [projectId]: currentSets.filter((s) => s.id !== id),
            },
            itemsByQuizSet: restItems,
            recordsByQuizSet: restRecords,
            activeQuizSetId:
              state.activeQuizSetId === id ? null : state.activeQuizSetId,
            testSession:
              state.testSession?.quizSetId === id ? null : state.testSession,
          };
        });
        return true;
      },

      selectQuizSet: (id) => {
        set({ activeQuizSetId: id });
      },

      getActiveQuizSet: () => {
        const { currentProjectId, activeQuizSetId, quizSetsByProject } = get();
        if (!currentProjectId || !activeQuizSetId) return null;
        const sets = quizSetsByProject[currentProjectId] ?? [];
        return sets.find((s) => s.id === activeQuizSetId) ?? null;
      },

      fetchItems: async (quizSetId) => {
        set({ loadingItems: true });
        try {
          const items = await listVLQuizItems(quizSetId);
          set((state) => ({
            itemsByQuizSet: {
              ...state.itemsByQuizSet,
              [quizSetId]: items,
            },
          }));
          return items;
        } catch (error) {
          console.error("[VLQuizStore] fetchItems failed", error);
          return [];
        } finally {
          set({ loadingItems: false });
        }
      },

      createItemsBatch: async (items) => {
        if (items.length === 0) return [];
        const createdItems = await createVLQuizItemsBatch(items);
        if (createdItems.length === 0) return [];

        const quizSetId = items[0].quizSetId;
        set((state) => {
          const currentItems = state.itemsByQuizSet[quizSetId] ?? [];
          return {
            itemsByQuizSet: {
              ...state.itemsByQuizSet,
              [quizSetId]: [...currentItems, ...createdItems],
            },
          };
        });

        // 更新测验集的 itemCount
        const quizSet = await getVLQuizSet(quizSetId);
        if (quizSet) {
          set((state) => {
            const projectId = get().currentProjectId;
            if (!projectId) return state;

            const currentSets = state.quizSetsByProject[projectId] ?? [];
            return {
              quizSetsByProject: {
                ...state.quizSetsByProject,
                [projectId]: currentSets.map((s) =>
                  s.id === quizSetId ? quizSet : s,
                ),
              },
            };
          });
        }

        return createdItems;
      },

      updateItem: async (payload) => {
        const updatedItem = await updateVLQuizItem(payload);
        if (!updatedItem) return null;

        // 找到该题目所属的测验集并更新
        const { itemsByQuizSet } = get();
        let targetQuizSetId: number | null = null;
        for (const [quizSetIdStr, items] of Object.entries(itemsByQuizSet)) {
          if (items.some((item) => item.id === payload.id)) {
            targetQuizSetId = Number(quizSetIdStr);
            break;
          }
        }

        if (targetQuizSetId !== null) {
          set((state) => ({
            itemsByQuizSet: {
              ...state.itemsByQuizSet,
              [targetQuizSetId!]: (
                state.itemsByQuizSet[targetQuizSetId!] ?? []
              ).map((item) => (item.id === payload.id ? updatedItem : item)),
            },
          }));
        }

        return updatedItem;
      },

      deleteItem: async (id) => {
        // 找到该题目所属的测验集
        const { itemsByQuizSet } = get();
        let targetQuizSetId: number | null = null;
        for (const [quizSetIdStr, items] of Object.entries(itemsByQuizSet)) {
          if (items.some((item) => item.id === id)) {
            targetQuizSetId = Number(quizSetIdStr);
            break;
          }
        }

        const success = await deleteVLQuizItem(id);
        if (!success) return false;

        if (targetQuizSetId !== null) {
          set((state) => ({
            itemsByQuizSet: {
              ...state.itemsByQuizSet,
              [targetQuizSetId!]: (
                state.itemsByQuizSet[targetQuizSetId!] ?? []
              ).filter((item) => item.id !== id),
            },
          }));
        }

        return true;
      },

      getItems: (quizSetId) => {
        return get().itemsByQuizSet[quizSetId] ?? [];
      },

      fetchRecords: async (params) => {
        set({ loadingRecords: true });
        try {
          const records = await listVLQuizRecords(params);
          if (params.quizSetId) {
            set((state) => ({
              recordsByQuizSet: {
                ...state.recordsByQuizSet,
                [params.quizSetId!]: records,
              },
            }));
          }
          return records;
        } catch (error) {
          console.error("[VLQuizStore] fetchRecords failed", error);
          return [];
        } finally {
          set({ loadingRecords: false });
        }
      },

      createRecord: async (payload) => {
        const record = await createVLQuizRecord(payload);
        set((state) => {
          const currentRecords =
            state.recordsByQuizSet[payload.quizSetId] ?? [];
          return {
            recordsByQuizSet: {
              ...state.recordsByQuizSet,
              [payload.quizSetId]: [record, ...currentRecords],
            },
          };
        });
        return record;
      },

      deleteRecord: async (id) => {
        // 找到该记录所属的测验集
        const { recordsByQuizSet } = get();
        let targetQuizSetId: number | null = null;
        for (const [quizSetIdStr, records] of Object.entries(
          recordsByQuizSet,
        )) {
          if (records.some((r) => r.id === id)) {
            targetQuizSetId = Number(quizSetIdStr);
            break;
          }
        }

        const success = await deleteVLQuizRecord(id);
        if (!success) return false;

        if (targetQuizSetId !== null) {
          set((state) => ({
            recordsByQuizSet: {
              ...state.recordsByQuizSet,
              [targetQuizSetId!]: (
                state.recordsByQuizSet[targetQuizSetId!] ?? []
              ).filter((r) => r.id !== id),
            },
          }));
        }

        return true;
      },

      getRecords: (quizSetId) => {
        return get().recordsByQuizSet[quizSetId] ?? [];
      },

      startTest: async (quizSetId) => {
        // 确保测验题已加载
        let items = get().itemsByQuizSet[quizSetId];
        if (!items || items.length === 0) {
          items = await get().fetchItems(quizSetId);
        }

        if (items.length === 0) {
          throw new Error("测验集没有题目");
        }

        set({
          testSession: {
            quizSetId,
            items,
            currentIndex: 0,
            answers: {},
            startTime: Date.now(),
            status: "testing",
          },
        });
      },

      submitAnswer: (itemId, answer) => {
        set((state) => {
          if (!state.testSession) return state;
          return {
            testSession: {
              ...state.testSession,
              answers: {
                ...state.testSession.answers,
                [itemId]: answer,
              },
            },
          };
        });
      },

      nextQuestion: () => {
        set((state) => {
          if (!state.testSession) return state;
          const nextIndex = Math.min(
            state.testSession.currentIndex + 1,
            state.testSession.items.length - 1,
          );
          return {
            testSession: {
              ...state.testSession,
              currentIndex: nextIndex,
            },
          };
        });
      },

      prevQuestion: () => {
        set((state) => {
          if (!state.testSession) return state;
          const prevIndex = Math.max(state.testSession.currentIndex - 1, 0);
          return {
            testSession: {
              ...state.testSession,
              currentIndex: prevIndex,
            },
          };
        });
      },

      goToQuestion: (index) => {
        set((state) => {
          if (!state.testSession) return state;
          const validIndex = Math.max(
            0,
            Math.min(index, state.testSession.items.length - 1),
          );
          return {
            testSession: {
              ...state.testSession,
              currentIndex: validIndex,
            },
          };
        });
      },

      finishTest: async () => {
        const { testSession, currentProjectId } = get();
        if (!testSession || !currentProjectId) return null;

        const { quizSetId, items, answers, startTime } = testSession;
        const duration = Math.round((Date.now() - startTime) / 1000);

        // 计算成绩
        const answersArray = Object.values(answers);
        const correctCount = answersArray.filter((a) => a.isCorrect).length;
        const totalCount = items.length;
        const score = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

        // 创建记录
        const record = await get().createRecord({
          quizSetId,
          projectId: currentProjectId,
          score,
          correctCount,
          totalCount,
          answers: answersArray,
          duration,
        });

        // 更新会话状态
        set((state) => ({
          testSession: state.testSession
            ? {
                ...state.testSession,
                status: "submitted",
              }
            : null,
        }));

        return record;
      },

      cancelTest: () => {
        set({ testSession: null });
      },

      getTestProgress: () => {
        const { testSession } = get();
        if (!testSession) return null;
        return {
          current: testSession.currentIndex + 1,
          total: testSession.items.length,
          answered: Object.keys(testSession.answers).length,
        };
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: "vl-quiz-store",
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        activeQuizSetId: state.activeQuizSetId,
      }),
    },
  ),
);

export default useVLQuizStore;
