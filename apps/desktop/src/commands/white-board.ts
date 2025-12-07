import { invoke } from "@/electron";
import { WhiteBoard, WhiteBoardContent, ICreateWhiteBoard } from "@/types";

export const createWhiteBoard = async (
  whiteBoard: ICreateWhiteBoard,
): Promise<WhiteBoard> => {
  return invoke("create-white-board", whiteBoard);
};

export const getWhiteBoardById = async (id: number): Promise<WhiteBoard> => {
  return invoke("get-white-board-by-id", id);
};

export const getAllWhiteBoards = async (): Promise<WhiteBoard[]> => {
  return await invoke("get-all-white-boards");
};

export const updateWhiteBoard = async (
  whiteBoard: Omit<WhiteBoard, "updateTime">,
): Promise<WhiteBoard> => {
  return invoke("update-white-board", whiteBoard);
};

export const deleteWhiteBoard = async (id: number): Promise<void> => {
  return invoke("delete-white-board", id);
};

export const getWhiteboardByIds = async (
  ids: number[],
): Promise<WhiteBoard[]> => {
  return invoke("get-whiteboard-by-ids", ids);
};

export const addSubWhiteBoard = async (
  whiteBoardId: number,
  name: string,
  whiteBoardData: WhiteBoardContent["data"],
): Promise<WhiteBoardContent> => {
  return invoke("add-sub-white-board", whiteBoardId, name, whiteBoardData);
};

export const deleteSubWhiteBoard = async (
  whiteBoardId: number,
  whiteBoardContentId: number,
): Promise<WhiteBoardContent> => {
  return invoke("delete-sub-white-board", whiteBoardId, whiteBoardContentId);
};

export const updateSubWhiteBoard = async (
  whiteBoardContentId: number,
  name: string,
  whiteBoardData: WhiteBoardContent["data"],
): Promise<WhiteBoardContent> => {
  return invoke(
    "update-sub-white-board",
    whiteBoardContentId,
    name,
    whiteBoardData,
  );
};

export const createWhiteBoardContent = async (
  whiteBoardContent: Omit<
    WhiteBoardContent,
    "id" | "createTime" | "updateTime" | "refCount"
  >,
): Promise<WhiteBoardContent> => {
  return invoke("white-board-content:create", whiteBoardContent);
};

export const getWhiteBoardContentById = async (
  id: number,
): Promise<WhiteBoardContent> => {
  return invoke("white-board-content:get-by-id", id);
};

export const updateWhiteBoardContent = async (
  whiteBoardContent: Omit<WhiteBoardContent, "createTime" | "updateTime">,
): Promise<WhiteBoardContent> => {
  return invoke("white-board-content:update", whiteBoardContent);
};

export const deleteWhiteBoardContent = async (id: number): Promise<void> => {
  return invoke("white-board-content:delete", id);
};

export const incrementWhiteBoardContentRefCount = async (
  id: number,
): Promise<void> => {
  return invoke("white-board-content:increment-ref-count", id);
};
