import { create } from "zustand";
import { produce } from "immer";
import { Pdf } from "@/types";
import { createPdf, updatePdf, removePdf, getPdfList } from "@/commands";

interface IState {
  pdfs: Pdf[];
  activePdf: Pdf | null;
}

interface IAction {
  initPdfs: () => Promise<void>;
  createPdf: (pdf: Omit<Pdf, "id" | "createTime" | "updateTime">) => Promise<Pdf>;
  updatePdf: (pdf: Pdf) => Promise<Pdf>;
  removePdf: (id: number) => Promise<number>;
  setActivePdf: (pdf: Pdf | null) => void;
}

const usePdfsStore = create<IState & IAction>((set, get) => ({
  pdfs: [],
  activePdf: null,
  initPdfs: async () => {
    const pdfs = await getPdfList();
    set({
      pdfs,
    });
  },
  createPdf: async (pdf: Omit<Pdf, "id" | "createTime" | "updateTime">) => {
    const { pdfs } = get();
    const newPdf = await createPdf(pdf);
    const newPdfs = produce(pdfs, draft => {
      draft.push(newPdf);
    });
    set({
      pdfs: newPdfs,
    });
    return newPdf;
  },
  updatePdf: async (pdf: Pdf) => {
    const { pdfs } = get();
    const newPdf = await updatePdf(pdf);
    const newPdfs = produce(pdfs, draft => {
      const index = draft.findIndex(item => item.id === pdf.id);
      draft[index] = newPdf;
    });
    set({
      pdfs: newPdfs,
    });
    return newPdf;
  },
  removePdf: async (id: number) => {
    const { pdfs } = get();
    const newPdfs = produce(pdfs, draft => {
      const index = draft.findIndex(item => item.id === id);
      draft.splice(index, 1);
    });
    // 先释放这个 PDF 下对话的宿主会话与运行态（M4-e）：主进程删 PDF 时连对话文件一起删，
    // 宿主还开着的话会往已删的文件里继续写
    const { default: useChatSessionStore } = await import("@/stores/useChatSessionStore");
    await useChatSessionStore
      .getState()
      .releaseBucket({ scope: "pdf-chat", domainRef: String(id) });
    await removePdf(id);
    set({
      pdfs: newPdfs,
    });
    return id;
  },
  setActivePdf: (pdf: Pdf | null) => {
    set({
      activePdf: pdf,
    });
  },
}));

export default usePdfsStore;
