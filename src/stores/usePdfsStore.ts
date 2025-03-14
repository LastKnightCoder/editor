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
  createPdf: (
    pdf: Omit<Pdf, "id" | "createTime" | "updateTime">,
  ) => Promise<Pdf>;
  updatePdf: (pdf: Pdf) => Promise<Pdf>;
  removePdf: (id: number) => Promise<number>;
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
    const newPdfs = produce(pdfs, (draft) => {
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
    const newPdfs = produce(pdfs, (draft) => {
      const index = draft.findIndex((item) => item.id === pdf.id);
      draft[index] = newPdf;
    });
    set({
      pdfs: newPdfs,
    });
    return newPdf;
  },
  removePdf: async (id: number) => {
    const { pdfs } = get();
    const newPdfs = produce(pdfs, (draft) => {
      const index = draft.findIndex((item) => item.id === id);
      draft.splice(index, 1);
    });
    await removePdf(id);
    set({
      pdfs: newPdfs,
    });
    return id;
  },
}));

export default usePdfsStore;
