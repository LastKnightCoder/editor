import { create } from "zustand";

interface ExtNoteInsertState {
  /** 模态框是否打开 */
  isOpen: boolean;
  /** 插入模式：项目 / 知识库 */
  mode: "project" | "document";
  /** 桌面端内容 ID */
  contentId: number | null;
  /** 插入标题 */
  title: string;
  /** 插入方式 */
  insertMode: "copy" | "shared-content";
  /** 成功回调 */
  onSuccess?: (() => void) | null;

  /** 打开插入弹窗 */
  openModal: (params: {
    mode: "project" | "document";
    contentId: number;
    title?: string;
    insertMode?: "copy" | "shared-content";
    onSuccess?: (() => void) | null;
  }) => void;
  /** 关闭弹窗 */
  closeModal: () => void;
}

const useExtNoteInsertStore = create<ExtNoteInsertState>((set) => ({
  isOpen: false,
  mode: "project",
  contentId: null,
  title: "",
  insertMode: "copy",
  onSuccess: null,

  openModal: (params) =>
    set({
      isOpen: true,
      mode: params.mode,
      contentId: params.contentId,
      title: params.title || "",
      insertMode: params.insertMode || "copy",
      onSuccess: params.onSuccess || null,
    }),

  closeModal: () =>
    set({
      isOpen: false,
      contentId: null,
      title: "",
      insertMode: "copy",
      onSuccess: null,
    }),
}));

export default useExtNoteInsertStore;
