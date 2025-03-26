import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ECardCategory } from "@/types";

export enum ViewMode {
  List = "list",
  Graph = "graph",
}

interface IState {
  selectCategory: ECardCategory;
  activeCardTag: string;
  viewMode: ViewMode;
  showScrollToTop: boolean;
  isPresentation: boolean;
}

const initState: IState = {
  selectCategory: ECardCategory.Permanent,
  activeCardTag: "",
  viewMode: ViewMode.List,
  showScrollToTop: false,
  isPresentation: false,
};

const useCardsManagementStore = create<IState>()(
  persist(
    () => ({
      ...initState,
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
