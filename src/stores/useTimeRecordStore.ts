import { create } from 'zustand';
import { createTimeRecord, updateTimeRecord, deleteTimeRecord, getAllTimeRecords } from '@/commands';
import { ITimeRecord, TimeRecordGroup } from "@/types";
import dayjs from "dayjs";

interface IState {
  loading: boolean;
  timeRecords: TimeRecordGroup;
  currentDate: string;
}

interface IActions {
  init: () => Promise<void>;
  createTimeRecord: (timeRecord: Omit<ITimeRecord, 'id'>) => Promise<ITimeRecord>;
  updateTimeRecord: (timeRecord: ITimeRecord) => Promise<ITimeRecord>;
  deleteTimeRecord: (id: number) => Promise<number>;
}

const initState: IState = {
  loading: false,
  timeRecords: [],
  currentDate: dayjs().format('YYYY-MM-DD')
}

const useTimeRecordStore = create<IState & IActions>((set) => ({
  ...initState,
  init: async () => {
    set({ loading: true });
    try {
      const timeRecords = await getAllTimeRecords();
      set({ timeRecords });
    } catch (e) {
      console.error(e);
    } finally {
      set({ loading: false });
    }
  },
  createTimeRecord: async (timeRecord) => {
    const res = await createTimeRecord(timeRecord);
    const timeRecords = await getAllTimeRecords();
    set({ timeRecords });
    return res;
  },
  updateTimeRecord: async (timeRecord) => {
    const res = updateTimeRecord(timeRecord);
    const timeRecords = await getAllTimeRecords();
    set({ timeRecords });
    return res;
  },
  deleteTimeRecord: async (id) => {
    const res = await deleteTimeRecord(id);
    const timeRecords = await getAllTimeRecords();
    set({ timeRecords });
    return res;
  }
}));

export default useTimeRecordStore;