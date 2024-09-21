import { create } from 'zustand';
import { BoardElement } from "@/pages/WhiteBoard/Board.ts";

interface IWhiteBoardState {
  value: BoardElement[];
}

const useWhiteBoardStore = create<IWhiteBoardState>(() => ({
  value: []
}))

export default useWhiteBoardStore;