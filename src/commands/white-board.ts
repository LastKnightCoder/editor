import { invoke } from "@tauri-apps/api";
import { WhiteBoard } from "@/types";

const transformWhiteBoard = (item: any): WhiteBoard => {
  return {
    ...item,
    createTime: new Date(item.create_time),
    updateTime: new Date(item.update_time),
    data: JSON.parse(item.data),
  };
}

export const createWhiteBoard = async (whiteBoard: Omit<WhiteBoard, 'id' | 'createTime' | 'updateTime'>): Promise<WhiteBoard> => {
  return invoke('plugin:white_board|create_white_board', {
    ...whiteBoard,
    data: JSON.stringify(whiteBoard.data),
  }).then(transformWhiteBoard);
}

export const getWhiteBoardById = async (id: number): Promise<WhiteBoard> => {
  return invoke('plugin:white_board|get_white_board_by_id', {
    id
  }).then(transformWhiteBoard);
}

export const getAllWhiteBoards = async (): Promise<WhiteBoard[]> => {
  const list: any[] = await invoke('plugin:white_board|get_all_white_boards');
  return list.map(transformWhiteBoard);
}

export const updateWhiteBoard = async (whiteBoard: Omit<WhiteBoard, 'updateTime'>): Promise<WhiteBoard> => {
  return invoke('plugin:white_board|update_white_board', {
    ...whiteBoard,
    data: JSON.stringify(whiteBoard.data),
  }).then(transformWhiteBoard);
}

export const deleteWhiteBoard = async (id: number): Promise<void> => {
  return invoke('plugin:white_board|delete_white_board', {
    id
  });
}

