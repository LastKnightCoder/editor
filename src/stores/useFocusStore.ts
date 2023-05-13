import { create } from "zustand";

interface FocusState {
  isFocus: boolean;
}

interface Actions {
  setFocus: (isFocus: boolean) => void;
}

const initialState: FocusState = {
  isFocus: false,
}

export const useFocusStore = create<FocusState & Actions>((set) => ({
  ...initialState,
  setFocus: (isFocus: boolean) => {
    set((state) => ({ ...state, isFocus }));
  }
}));