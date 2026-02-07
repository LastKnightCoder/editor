import { create } from "zustand";

interface ExtNoteInsertState {
  /** 模态框是否打开 */
  isOpen: boolean;
  /** 插入模式：项目 / 知识库 */
  mode: "project" | "document";
  /** 桌面端内容 ID */
  contentId: number | null;

  /** 打开插入弹窗 */
  openModal: (params: {
    mode: "project" | "document";
    contentId: number;
  }) => void;
  /** 关闭弹窗 */
  closeModal: () => void;
}

const useExtNoteInsertStore = create<ExtNoteInsertState>((set) => ({
  isOpen: false,
  mode: "project",
  contentId: null,

  openModal: (params) =>
    set({
      isOpen: true,
      mode: params.mode,
      contentId: params.contentId,
    }),

  closeModal: () =>
    set({
      isOpen: false,
      contentId: null,
    }),
}));

export default useExtNoteInsertStore;
