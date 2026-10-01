import { create } from "zustand";
import type { Editor } from "slate";
import { type MediaType } from "../services/mediaProviders";

interface MediaUrlInputState {
  open: boolean;
  /** 弹窗归属的编辑器实例：同页多编辑器时仅归属者渲染弹窗 */
  editor: Editor | null;
  mediaType: MediaType;
  show: (editor: Editor, mediaType: MediaType) => void;
  close: () => void;
  /** 编辑器卸载时释放归属，避免 store 滞留失效实例 */
  release: (editor: Editor) => void;
}

const useMediaUrlInputStore = create<MediaUrlInputState>(set => ({
  open: false,
  editor: null,
  mediaType: "image",
  show: (editor, mediaType) => set({ open: true, editor, mediaType }),
  close: () => set({ open: false, editor: null }),
  release: editor =>
    set(state => (state.editor === editor ? { open: false, editor: null } : state)),
}));

export default useMediaUrlInputStore;
