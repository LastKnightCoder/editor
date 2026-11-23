import { invoke } from "@/electron";
import { withModule } from "./module-init";
import { Whiteboard, WhiteboardContent, WhiteboardPageHeader, ICreateWhiteboard } from "@/types";
import type {
  ContentEntityTarget,
  ContentEntityReference,
} from "@tau/db-schema/content-identities";

export const createWhiteboard = async (whiteboard: ICreateWhiteboard): Promise<Whiteboard> => {
  return invoke("create-white-board", whiteboard);
};

export const getWhiteboardById = async (id: number, view?: "preview"): Promise<Whiteboard> => {
  return view ? invoke("get-white-board-by-id", id, view) : invoke("get-white-board-by-id", id);
};

/** 按页 id 反查所属白板；独立页返回 null */
export const getWhiteboardByContentId = async (contentId: number): Promise<Whiteboard | null> => {
  return invoke("get-white-board-by-content-id", contentId);
};

export const getAllWhiteboards = async (): Promise<Whiteboard[]> => {
  return await invoke("get-all-white-boards");
};

/** 只改白板元信息（不回写子白板）；字段缺省 = 不改，空值 = 清空 */
export const updateWhiteboardMeta = async (
  id: number,
  patch: Partial<Pick<Whiteboard, "title" | "description" | "tags" | "snapshot">>
): Promise<Whiteboard> => {
  return invoke("update-white-board-meta", id, patch);
};

export const deleteWhiteboard = async (id: number): Promise<void> => {
  return withModule("whiteboard-documents", () => invoke("delete-white-board", id));
};

export const addSubWhiteboard = async (
  whiteboardId: number,
  name: string,
  whiteboardData: WhiteboardContent["data"]
): Promise<WhiteboardContent> => {
  return invoke("add-sub-white-board", whiteboardId, name, whiteboardData);
};

export const deleteSubWhiteboard = async (
  whiteboardId: number,
  whiteboardContentId: number
): Promise<WhiteboardContent> => {
  return invoke("delete-sub-white-board", whiteboardId, whiteboardContentId);
};

export const updateSubWhiteboard = async (
  whiteboardContentId: ContentEntityTarget,
  name: string,
  whiteboardData: WhiteboardContent["data"]
): Promise<WhiteboardContent> => {
  return invoke("update-sub-white-board", whiteboardContentId, name, whiteboardData);
};

export const setActiveSubWhiteboard = async (
  whiteboardId: number,
  whiteboardContentId: number | null
): Promise<Whiteboard> => {
  return invoke("set-active-sub-white-board", whiteboardId, whiteboardContentId);
};

export const reorderSubWhiteboard = async (
  whiteboardId: number,
  orderedIds: number[]
): Promise<Whiteboard> => {
  return invoke("reorder-sub-white-board", whiteboardId, orderedIds);
};

/** 只改页名，不回写页数据 */
export const renameSubWhiteboard = async (
  whiteboardContentId: number,
  name: string
): Promise<WhiteboardContent> => {
  return invoke("rename-sub-white-board", whiteboardContentId, name);
};

/** 复制一页：副本插在原页之后并设为当前页，返回更新后的白板 */
export const duplicateSubWhiteboard = async (
  whiteboardId: number,
  whiteboardContentId: number
): Promise<Whiteboard> => {
  return invoke("duplicate-sub-white-board", whiteboardId, whiteboardContentId);
};

export const createWhiteboardContent = async (
  whiteboardContent: Omit<WhiteboardContent, "id" | "createTime" | "updateTime" | "refCount">
): Promise<WhiteboardContent> => {
  return invoke("white-board-content:create", whiteboardContent);
};
export const createPendingWhiteboardContent = (
  value: Omit<WhiteboardContent, "id" | "createTime" | "updateTime" | "refCount">
): Promise<{ content: WhiteboardContent; reference: ContentEntityReference }> =>
  invoke("white-board-content:create-pending", value);
export const getWhiteboardContentReference = (id: number): Promise<ContentEntityReference> =>
  invoke("white-board-content:reference", id);

export const getWhiteboardContentById = async (
  id: ContentEntityTarget
): Promise<WhiteboardContent> => invoke("white-board-content:get-by-id", id);

export const getWhiteboardPageHeader = async (
  id: ContentEntityTarget
): Promise<WhiteboardPageHeader> => invoke("white-board-content:get-by-id", id, "header");

export const updateWhiteboardContent = async (
  whiteboardContent: Omit<WhiteboardContent, "id" | "createTime" | "updateTime"> & {
    id: ContentEntityTarget;
  }
): Promise<WhiteboardContent> => {
  return invoke("white-board-content:update", whiteboardContent);
};

export const deleteWhiteboardContent = async (id: number): Promise<void> => {
  return invoke("white-board-content:delete", id);
};

export const incrementWhiteboardContentRefCount = async (id: number): Promise<void> => {
  return invoke("white-board-content:increment-ref-count", id);
};
