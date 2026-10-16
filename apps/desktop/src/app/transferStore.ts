/**
 * 批量导出浮层开闭态（壳层浮层，命令面板 / 设置「导入与导出」多入口触发）。
 * 归 app 层：features 域之间禁止互引 store，触发方与 features/transfer 都只消费本 store。
 */

import { create } from "zustand";

interface TransferUiStore {
  /** null = 关闭；projectId 缺省时先选项目 */
  projectExport: { projectId?: number } | null;
  openProjectExport: (projectId?: number) => void;
  closeProjectExport: () => void;
}

export const useTransferStore = create<TransferUiStore>()(set => ({
  projectExport: null,
  openProjectExport: projectId => set({ projectExport: { projectId } }),
  closeProjectExport: () => set({ projectExport: null }),
}));
