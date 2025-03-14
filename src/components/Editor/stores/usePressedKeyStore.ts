import isHotKey from "is-hotkey";
import { create } from "zustand";

interface KeyPressedState {
  isModKey: boolean;
  isShiftKey: boolean;
  isOptionKey: boolean;
  isCtrlKey: boolean;
  isReset: boolean;
}

interface Actions {
  listenKeyPressed: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  resetPressedKey: () => void;
}

const initialState: KeyPressedState = {
  isModKey: false,
  isShiftKey: false,
  isOptionKey: false,
  isCtrlKey: false,
  isReset: false,
};

export const usePressedKeyStore = create<KeyPressedState & Actions>((set) => ({
  ...initialState,
  listenKeyPressed: (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isHotKey("mod", event)) {
      set((state) => ({ ...state, isModKey: true, isReset: false }));
    }
    if (isHotKey("shift", event)) {
      set((state) => ({ ...state, isShiftKey: true, isReset: false }));
    }
    if (isHotKey("option", event)) {
      set((state) => ({ ...state, isOptionKey: true, isReset: false }));
    }
    if (isHotKey("ctrl", event)) {
      set((state) => ({ ...state, isCtrlKey: true, isReset: false }));
    }
  },
  resetPressedKey: () => {
    set((state) => ({ ...state, ...initialState, isReset: true }));
  },
}));
