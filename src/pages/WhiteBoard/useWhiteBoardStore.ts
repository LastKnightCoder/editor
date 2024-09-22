import { create } from 'zustand';
import { BoardElement, ViewPort } from "@/pages/WhiteBoard/Board.ts";

interface IWhiteBoardState {
  value: BoardElement[];
  viewPort: ViewPort;
}

const useWhiteBoardStore = create<IWhiteBoardState>(() => ({
  value: [],
  viewPort: {
    width: 0,
    height: 0,
    minX: 0,
    minY: 0,
    zoom: 1
  }
}))

export default useWhiteBoardStore;