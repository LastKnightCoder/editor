import { create } from "zustand";

interface OutlineGenerationState {
  /** 正在生成的笔记 ID 集合 */
  generatingNoteIds: Set<number>;
  /** 每个笔记的生成内容（流式更新） */
  generatingContent: Record<number, string>;
  /** 每个笔记的生成错误 */
  generationErrors: Record<number, string>;

  /** 开始生成 */
  startGeneration: (noteId: number) => void;
  /** 更新生成内容 */
  updateContent: (noteId: number, content: string) => void;
  /** 完成生成 */
  finishGeneration: (noteId: number) => void;
  /** 设置错误 */
  setError: (noteId: number, error: string) => void;
  /** 清除错误 */
  clearError: (noteId: number) => void;
  /** 检查是否正在生成 */
  isGenerating: (noteId: number) => boolean;
  /** 获取生成内容 */
  getContent: (noteId: number) => string | undefined;
  /** 获取错误信息 */
  getError: (noteId: number) => string | undefined;
}

const useOutlineGenerationStore = create<OutlineGenerationState>(
  (set, get) => ({
    generatingNoteIds: new Set(),
    generatingContent: {},
    generationErrors: {},

    startGeneration: (noteId: number) => {
      set((state) => {
        const newSet = new Set(state.generatingNoteIds);
        newSet.add(noteId);
        return {
          generatingNoteIds: newSet,
          generatingContent: {
            ...state.generatingContent,
            [noteId]: "",
          },
          generationErrors: {
            ...state.generationErrors,
            [noteId]: "",
          },
        };
      });
    },

    updateContent: (noteId: number, content: string) => {
      set((state) => ({
        generatingContent: {
          ...state.generatingContent,
          [noteId]: content,
        },
      }));
    },

    finishGeneration: (noteId: number) => {
      set((state) => {
        const newSet = new Set(state.generatingNoteIds);
        newSet.delete(noteId);
        // 清理内容缓存
        const newContent = { ...state.generatingContent };
        delete newContent[noteId];
        return {
          generatingNoteIds: newSet,
          generatingContent: newContent,
        };
      });
    },

    setError: (noteId: number, error: string) => {
      set((state) => {
        const newSet = new Set(state.generatingNoteIds);
        newSet.delete(noteId);
        return {
          generatingNoteIds: newSet,
          generationErrors: {
            ...state.generationErrors,
            [noteId]: error,
          },
        };
      });
    },

    clearError: (noteId: number) => {
      set((state) => {
        const newErrors = { ...state.generationErrors };
        delete newErrors[noteId];
        return {
          generationErrors: newErrors,
        };
      });
    },

    isGenerating: (noteId: number) => {
      return get().generatingNoteIds.has(noteId);
    },

    getContent: (noteId: number) => {
      return get().generatingContent[noteId];
    },

    getError: (noteId: number) => {
      return get().generationErrors[noteId];
    },
  }),
);

export default useOutlineGenerationStore;
