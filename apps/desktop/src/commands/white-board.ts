import { invoke } from "@/electron";
import { withModule } from "./module-init";
import { WhiteBoard, WhiteBoardContent, ICreateWhiteBoard } from "@/types";
import type {
  ContentEntityTarget,
  ContentEntityReference,
} from "@tau/db-schema/content-identities";

export const createWhiteBoard = async (whiteBoard: ICreateWhiteBoard): Promise<WhiteBoard> => {
  return invoke("create-white-board", whiteBoard);
};

export const getWhiteBoardById = async (id: number): Promise<WhiteBoard> => {
  return invoke("get-white-board-by-id", id);
};

/** 按页 id 反查所属白板；独立页返回 null */
export const getWhiteBoardByContentId = async (contentId: number): Promise<WhiteBoard | null> => {
  return invoke("get-white-board-by-content-id", contentId);
};

export const getAllWhiteBoards = async (): Promise<WhiteBoard[]> => {
  return await invoke("get-all-white-boards");
};

export const updateWhiteBoard = async (
  whiteBoard: Omit<WhiteBoard, "updateTime">
): Promise<WhiteBoard> => {
  return invoke("update-white-board", whiteBoard);
};

/** 只改白板元信息（不回写子白板）；字段缺省 = 不改，空值 = 清空 */
export const updateWhiteBoardMeta = async (
  id: number,
  patch: Partial<Pick<WhiteBoard, "title" | "description" | "tags" | "snapshot">>
): Promise<WhiteBoard> => {
  return invoke("update-white-board-meta", id, patch);
};

export const deleteWhiteBoard = async (id: number): Promise<void> => {
  return withModule("whiteboard-documents", () => invoke("delete-white-board", id));
};

export const getWhiteboardByIds = async (ids: number[]): Promise<WhiteBoard[]> => {
  return invoke("get-whiteboard-by-ids", ids);
};

export const addSubWhiteBoard = async (
  whiteBoardId: number,
  name: string,
  whiteBoardData: WhiteBoardContent["data"]
): Promise<WhiteBoardContent> => {
  return invoke("add-sub-white-board", whiteBoardId, name, whiteBoardData);
};

export const deleteSubWhiteBoard = async (
  whiteBoardId: number,
  whiteBoardContentId: number
): Promise<WhiteBoardContent> => {
  return invoke("delete-sub-white-board", whiteBoardId, whiteBoardContentId);
};

export const updateSubWhiteBoard = async (
  whiteBoardContentId: ContentEntityTarget,
  name: string,
  whiteBoardData: WhiteBoardContent["data"]
): Promise<WhiteBoardContent> => {
  return invoke("update-sub-white-board", whiteBoardContentId, name, whiteBoardData);
};

export const setActiveSubWhiteBoard = async (
  whiteBoardId: number,
  whiteBoardContentId: number | null
): Promise<WhiteBoard> => {
  return invoke("set-active-sub-white-board", whiteBoardId, whiteBoardContentId);
};

export const reorderSubWhiteBoard = async (
  whiteBoardId: number,
  orderedIds: number[]
): Promise<WhiteBoard> => {
  return invoke("reorder-sub-white-board", whiteBoardId, orderedIds);
};

/** 只改页名，不回写页数据 */
export const renameSubWhiteBoard = async (
  whiteBoardContentId: number,
  name: string
): Promise<WhiteBoardContent> => {
  return invoke("rename-sub-white-board", whiteBoardContentId, name);
};

/** 复制一页：副本插在原页之后并设为当前页，返回更新后的白板 */
export const duplicateSubWhiteBoard = async (
  whiteBoardId: number,
  whiteBoardContentId: number
): Promise<WhiteBoard> => {
  return invoke("duplicate-sub-white-board", whiteBoardId, whiteBoardContentId);
};

export const createWhiteBoardContent = async (
  whiteBoardContent: Omit<WhiteBoardContent, "id" | "createTime" | "updateTime" | "refCount">
): Promise<WhiteBoardContent> => {
  return invoke("white-board-content:create", whiteBoardContent);
};
export const createPendingWhiteBoardContent = (
  value: Omit<WhiteBoardContent, "id" | "createTime" | "updateTime" | "refCount">
): Promise<{ content: WhiteBoardContent; reference: ContentEntityReference }> =>
  invoke("white-board-content:create-pending", value);
export const getWhiteBoardContentReference = (id: number): Promise<ContentEntityReference> =>
  invoke("white-board-content:reference", id);

export const getWhiteBoardContentById = async (
  id: ContentEntityTarget
): Promise<WhiteBoardContent> => {
  return invoke("white-board-content:get-by-id", id);
};

export const updateWhiteBoardContent = async (
  whiteBoardContent: Omit<WhiteBoardContent, "id" | "createTime" | "updateTime"> & {
    id: ContentEntityTarget;
  }
): Promise<WhiteBoardContent> => {
  return invoke("white-board-content:update", whiteBoardContent);
};

export const deleteWhiteBoardContent = async (id: number): Promise<void> => {
  return invoke("white-board-content:delete", id);
};

export const incrementWhiteBoardContentRefCount = async (id: number): Promise<void> => {
  return invoke("white-board-content:increment-ref-count", id);
};
