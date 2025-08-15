import { create } from "zustand";
import { persist } from "zustand/middleware";
import dayjs, { Dayjs } from "dayjs";

export type EPeriodType = "day" | "week" | "month" | "year";

interface State {
  periodType: EPeriodType;
  anchorDate: Dayjs;
  activeTab: "records" | "logs";
  activeLogId?: number;
  readonly: boolean;
  centuryStartYear: number;
}

interface Actions {
  setPeriodType: (t: EPeriodType) => void;
  setAnchorDate: (d: Dayjs) => void;
  setActiveTab: (t: "records" | "logs") => void;
  setActiveLogId: (id?: number) => void;
  setCenturyStartYear: (y: number) => void;
}

const STORAGE_KEY = "life-view-store";

const initialState: State = {
  periodType: "month",
  anchorDate: dayjs(),
  activeTab: "records",
  readonly: false,
  centuryStartYear: Math.floor(dayjs().year() / 100) * 100,
};

export const useLifeViewStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,
      setPeriodType: (t) => set({ periodType: t }),
      setAnchorDate: (d) => set({ anchorDate: d }),
      setActiveTab: (t) => set({ activeTab: t }),
      setActiveLogId: (id) => set({ activeLogId: id }),
      setCenturyStartYear: (y) => set({ centuryStartYear: y }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        periodType: s.periodType,
        activeTab: s.activeTab,
        readonly: s.readonly,
        centuryStartYear: s.centuryStartYear,
      }),
    },
  ),
);
