import { invoke } from "@/electron";
import { WhiteBoard } from "@/types";

export const createWhiteBoard = async (whiteBoard: Omit<WhiteBoard, 'id' | 'createTime' | 'updateTime'>): Promise<WhiteBoard> => {
  return invoke('create-white-board', whiteBoard);
}

export const getWhiteBoardById = async (id: number): Promise<WhiteBoard> => {
  return invoke('get-white-board-by-id', id);
}

export const getAllWhiteBoards = async (): Promise<WhiteBoard[]> => {
  return await invoke('get-all-white-boards');
}

export const updateWhiteBoard = async (whiteBoard: Omit<WhiteBoard, 'updateTime'>): Promise<WhiteBoard> => {
  return invoke('update-white-board', whiteBoard);
}

export const deleteWhiteBoard = async (id: number): Promise<void> => {
  return invoke('delete-white-board', id);
}

