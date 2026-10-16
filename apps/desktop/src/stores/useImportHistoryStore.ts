/**
 * 批量导入记录（本机持久化，按数据库区分）：设置「导入与导出」列出并可整批撤销。
 * 只记身份与概况，不存正文；撤销逻辑在 services/batch-import。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ImportTarget } from "@/utils/content-transfer/batch-import";

export interface ImportRecord {
  id: string;
  database: string;
  at: number;
  sourceName: string;
  sourcePath: string;
  target: ImportTarget;
  projectId?: number;
  projectTitle?: string;
  /** 文章或卡片 id */
  entityIds: number[];
  docCount: number;
  assetCount: number;
  linkCount: number;
  warnings: string[];
  stopped?: "canceled" | "failed";
}

const MAX_RECORDS = 30;
const MAX_WARNINGS = 200;

interface ImportHistoryStore {
  records: ImportRecord[];
  add: (record: ImportRecord) => void;
  remove: (id: string) => void;
}

export const useImportHistoryStore = create<ImportHistoryStore>()(
  persist(
    set => ({
      records: [],
      add: record =>
        set(state => ({
          records: [
            { ...record, warnings: record.warnings.slice(0, MAX_WARNINGS) },
            ...state.records,
          ].slice(0, MAX_RECORDS),
        })),
      remove: id => set(state => ({ records: state.records.filter(r => r.id !== id) })),
    }),
    { name: "tau-import-history" }
  )
);
