import { create } from "zustand";
import { produce } from "immer";
import { WhiteBoard, ICreateWhiteBoard } from "@/types";
import {
  createWhiteBoard,
  updateWhiteBoard,
  deleteWhiteBoard,
  getWhiteBoardById,
  getAllWhiteBoards,
} from "@/commands";

interface IState {
  whiteBoards: WhiteBoard[];
}

interface IAction {
  initWhiteBoards: () => Promise<void>;
  createWhiteBoard: (whiteBoard: ICreateWhiteBoard) => Promise<WhiteBoard>;
  updateWhiteBoard: (
    whiteBoard: Omit<WhiteBoard, "updateTime">,
  ) => Promise<WhiteBoard>;
  deleteWhiteBoard: (id: number) => Promise<void>;
  getWhiteBoardById: (id: number) => Promise<WhiteBoard>;
  getAllWhiteBoards: () => Promise<WhiteBoard[]>;
}

const useWhiteBoardStore = create<IState & IAction>((set, get) => ({
  whiteBoards: [],
  initWhiteBoards: async () => {
    const whiteBoards = await getAllWhiteBoards();
    set({
      whiteBoards,
    });
  },
  createWhiteBoard: async (whiteBoard: ICreateWhiteBoard) => {
    const { whiteBoards } = get();
    const newWhiteBoard = await createWhiteBoard(whiteBoard);
    const newWhiteBoards = produce(whiteBoards, (draft) => {
      draft.push(newWhiteBoard);
    });
    set({
      whiteBoards: newWhiteBoards,
    });
    return newWhiteBoard;
  },
  updateWhiteBoard: async (whiteBoard: Omit<WhiteBoard, "updateTime">) => {
    const { whiteBoards } = get();
    const updatedWhiteBoard = await updateWhiteBoard(whiteBoard);
    const newWhiteBoards = produce(whiteBoards, (draft) => {
      const index = draft.findIndex((item) => item.id === updatedWhiteBoard.id);
      if (index !== -1) {
        draft[index] = updatedWhiteBoard;
      }
    });
    set({
      whiteBoards: newWhiteBoards,
    });
    return updatedWhiteBoard;
  },
  deleteWhiteBoard: async (id: number) => {
    const { whiteBoards } = get();
    await deleteWhiteBoard(id);
    const newWhiteBoards = whiteBoards.filter((item) => item.id !== id);
    set({
      whiteBoards: newWhiteBoards,
    });
  },
  getWhiteBoardById: async (id: number) => {
    return getWhiteBoardById(id);
  },
  getAllWhiteBoards: async () => {
    return getAllWhiteBoards();
  },
}));

export default useWhiteBoardStore;
