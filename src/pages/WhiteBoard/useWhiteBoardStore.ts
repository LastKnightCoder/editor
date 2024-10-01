import { create } from 'zustand';
import { BoardElement, ViewPort, Selection } from "./types";

interface IWhiteBoardState {
  children: BoardElement[];
  viewPort: ViewPort;
  selection: Selection;
}

const useWhiteBoardStore = create<IWhiteBoardState>(() => ({
  children: [],
  viewPort: {
    width: 0,
    height: 0,
    minX: 0,
    minY: 0,
    zoom: 1
  },
  selection: {
    selectedElements: [],
    selectArea: null
  },
}))

export default useWhiteBoardStore;