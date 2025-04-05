import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ECardCategory, ICard } from "@/types";

export enum ViewMode {
  List = "list",
  Graph = "graph",
}

interface IState {
  selectCategory: ECardCategory;
  activeCardTag: string;
  viewMode: ViewMode;
  presentationCard: ICard | null;
}

interface IActions {
  startPresentation: (card: ICard) => void;
  stopPresentation: () => void;
}

const initState: IState = {
  selectCategory: ECardCategory.Permanent,
  activeCardTag: "",
  viewMode: ViewMode.List,
  presentationCard: null,
};

const useCardsManagementStore = create<IState & IActions>()(
  persist(
    (set) => ({
      ...initState,
      startPresentation: (card) => set({ presentationCard: card }),
      stopPresentation: () => set({ presentationCard: null }),
    }),
    {
      name: "cards-management",
      partialize: (state) => ({
        selectCategory: state.selectCategory,
        activeCardTag: state.activeCardTag,
        viewMode: state.viewMode,
      }),
    },
  ),
);

export default useCardsManagementStore;
