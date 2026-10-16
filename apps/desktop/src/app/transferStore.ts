/**
 * 导入导出浮层开闭态（壳层浮层，命令面板 / 设置「导入与导出」/ 页面导入菜单与拖入等多入口触发）。
 * 归 app 层：features 域之间禁止互引 store，触发方与 features/transfer 都只消费本 store。
 */

import { create } from "zustand";
import type { ImportTarget } from "@/utils/content-transfer/batch-import";
import type { ExportScope } from "@/services/markdown-export";

export interface ImportWizardRequest {
  /** 锁定导入目标（从卡片 / 文章页进入）；缺省由用户选择 */
  target?: ImportTarget;
  /** 已知来源（拖入）时跳过选择 */
  sourcePath?: string;
}

export interface MarkdownExportRequest {
  scope?: ExportScope;
  /** 从项目页唤起：范围为项目，只勾选这个项目 */
  projectId?: number;
}

interface TransferUiStore {
  /** null = 关闭 */
  markdownExport: MarkdownExportRequest | null;
  openMarkdownExport: (request?: MarkdownExportRequest) => void;
  closeMarkdownExport: () => void;
  importWizard: ImportWizardRequest | null;
  openImportWizard: (request?: ImportWizardRequest) => void;
  closeImportWizard: () => void;
}

export const useTransferStore = create<TransferUiStore>()(set => ({
  markdownExport: null,
  openMarkdownExport: (request = {}) => set({ markdownExport: request }),
  closeMarkdownExport: () => set({ markdownExport: null }),
  importWizard: null,
  openImportWizard: (request = {}) => set({ importWizard: request }),
  closeImportWizard: () => set({ importWizard: null }),
}));
