/**
 * 搜索面板状态 + 访问历史（D-003 命令面板运行时）。
 *
 * open 等 UI 态不持久化；visits（页面访问记录）持久化——由 AppShell 随页面栈
 * 记录，面板空态的「最近访问 + 常用」两组即来源于此（真实数据，不造假）。
 * 记录的是 page key，label/icon 渲染时从 navigation/pageMeta 反查，避免冗余存标签。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface VisitRecord {
  key: string;
  ts: number;
  /** 累计访问次数（「常用」组按此排序） */
  count: number;
}

interface SearchStore {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  visits: VisitRecord[];
  recordVisit: (key: string) => void;
}

const MAX_VISITS = 50;

export const useSearchStore = create<SearchStore>()(
  persist(
    set => ({
      open: false,
      openPalette: () => set({ open: true }),
      closePalette: () => set({ open: false }),
      togglePalette: () => set(s => ({ open: !s.open })),
      visits: [],
      recordVisit: key =>
        set(s => {
          const prev = s.visits.find(v => v.key === key);
          const rest = s.visits.filter(v => v.key !== key);
          return {
            visits: [{ key, ts: Date.now(), count: (prev?.count ?? 0) + 1 }, ...rest].slice(
              0,
              MAX_VISITS
            ),
          };
        }),
    }),
    {
      name: "tau-search-history",
      version: 3,
      migrate: persisted => {
        const state = persisted as { visits?: VisitRecord[] } | undefined;
        const visits = new Map<string, VisitRecord>();
        for (const visit of state?.visits ?? []) {
          if (["resources", "feed", "rssSubscription", "readLater"].includes(visit.key)) continue;
          const key = visit.key === "library" ? "projects" : visit.key;
          const previous = visits.get(key);
          visits.set(key, {
            key,
            ts: Math.max(previous?.ts ?? 0, visit.ts),
            count: (previous?.count ?? 0) + visit.count,
          });
        }
        return { visits: [...visits.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_VISITS) };
      },
      partialize: s => ({ visits: s.visits }),
    }
  )
);
