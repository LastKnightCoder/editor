// 协作域状态：由 CollaborationManager 单写，UI 只读订阅。
import { create } from "zustand";
// 值导入必须走纯函数子模块：包入口会连带引入 yjs，而本 store 被设置页静态引用
import { DEFAULT_COLLABORATION_URL } from "@tau/collaboration/src/protocol";
import type { CollaborationSession, JoinRequest } from "@tau/collaboration";

export type CollaborationStatus = "idle" | "starting" | "ready" | "error";

/** 服务端侧被动事件（被撤权/被结束）产生的一次性提示，由 UI 消费后清除 */
export type CollaborationNotice = {
  id: string;
  kind: "revoked" | "closed";
  documentId: string;
  title: string;
};

export type CollaborationStoreState = {
  serverUrl: string;
  nickname: string;
  deviceId?: string;
  sessions: CollaborationSession[];
  requests: JoinRequest[];
  notices: CollaborationNotice[];
  status: CollaborationStatus;
  error?: string;
};

export const useCollaborationStore = create<CollaborationStoreState>()(() => ({
  serverUrl: DEFAULT_COLLABORATION_URL,
  nickname: "Tau 用户",
  sessions: [],
  requests: [],
  notices: [],
  status: "idle",
}));

export function setCollaborationState(patch: Partial<CollaborationStoreState>) {
  useCollaborationStore.setState(patch);
}

export function pushCollaborationNotice(notice: CollaborationNotice) {
  useCollaborationStore.setState(state => ({ notices: [...state.notices, notice] }));
}

/** 消费一条提示；返回是否真正消费（多个页面实例同时挂载时仅首个实例负责 toast） */
export function consumeCollaborationNotice(id: string) {
  const exists = useCollaborationStore.getState().notices.some(notice => notice.id === id);
  if (!exists) return false;
  useCollaborationStore.setState(state => ({
    notices: state.notices.filter(notice => notice.id !== id),
  }));
  return true;
}
