/** PDF 列表本机偏好：排布、排序、导入时是否上传到云端（来源筛选与搜索不跨会话保留） */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PdfLayout, PdfSort } from "./model";

interface PdfPrefs {
  layout: PdfLayout;
  sort: PdfSort;
  uploadOnImport: boolean;
  setLayout: (layout: PdfLayout) => void;
  setSort: (sort: PdfSort) => void;
  setUploadOnImport: (upload: boolean) => void;
}

export const usePdfPrefs = create<PdfPrefs>()(
  persist(
    set => ({
      layout: "cover",
      sort: "opened",
      uploadOnImport: false,
      setLayout: layout => set({ layout }),
      setSort: sort => set({ sort }),
      setUploadOnImport: uploadOnImport => set({ uploadOnImport }),
    }),
    {
      name: "tau-pdf-prefs",
      partialize: ({ layout, sort, uploadOnImport }) => ({ layout, sort, uploadOnImport }),
    }
  )
);
