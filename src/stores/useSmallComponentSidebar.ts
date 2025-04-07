import { create } from "zustand";
import { persist } from "zustand/middleware";

interface IState {
  open: boolean;
  width: number;
}

const initState: IState = {
  open: false,
  width: 300,
};

const useSmallComponentSidebarStore = create<IState>()(
  persist(
    () => ({
      ...initState,
    }),
    {
      name: "small-component-sidebar",
      partialize: (state) => ({
        open: state.open,
        width: state.width,
      }),
    },
  ),
);

export default useSmallComponentSidebarStore;
