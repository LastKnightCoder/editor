import { create } from 'zustand';
import { BoardElement, ViewPort } from "@/pages/WhiteBoard/Board.ts";

interface IWhiteBoardState {
  children: BoardElement[];
  viewPort: ViewPort;
}

const useWhiteBoardStore = create<IWhiteBoardState>(() => ({
  children: [],
  viewPort: {
    width: 0,
    height: 0,
    minX: 0,
    minY: 0,
    zoom: 1
  }
}))

export default useWhiteBoardStore;