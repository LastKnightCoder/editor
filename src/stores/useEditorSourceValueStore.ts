import { create } from "zustand";
import {Descendant} from "slate";

interface IState {
  isOpen: boolean;
  content: Descendant[];
}

interface IActions {
  open: (content: Descendant[]) => void;
  close: () => void;
}

const initialState: IState = {
  isOpen: false,
  content: []
}

const useEditorSourceValueStore = create<IState & IActions>((set) => ({
  ...initialState,
  open: (content) => {
    set({
      isOpen: true,
      content,
    });
  },
  close: () => {
    set({
      ...initialState,
    });
  }
}));

export default useEditorSourceValueStore;
