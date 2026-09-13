import type {
  ContentSessionTarget,
  SharedContent,
} from "@tau/collaboration";
import {
  collaborationCommands,
  type CollaborationInvitation,
  type CollaborationServerConfig,
  type CollaborationSubscribeSnapshot,
  type CollaborationUploadResourcePayload,
  type SharedContentResult,
} from "@/commands/contracts/collaboration";

export type {
  CollaborationInvitation,
  CollaborationServerConfig,
  CollaborationSubscribeSnapshot,
  CollaborationUploadResourcePayload,
  SharedContentResult,
};

/** 加入协作：提交协作码，申请经内容作者批准后生效 */
export const joinCollaboration = async (code: string) => {
  return collaborationCommands.join.call(code);
};

/** 审批加入申请（approve 为 true 批准、false 拒绝） */
export const decideJoinRequest = async (requestId: string, approve: boolean) => {
  return collaborationCommands.decide.call(requestId, approve);
};

/** 结束共享（owner）/ 退出协作（member） */
export const leaveCollaboration = async (sessionId: string, pending?: boolean) => {
  return collaborationCommands.leave.call(sessionId, pending);
};

/** 丢弃本地未同步改动并退出共享 */
export const discardLocalCollaboration = async (sessionId: string) => {
  return collaborationCommands.discardLocal.call(sessionId);
};

/** owner 移除成员设备，该设备立即失去访问权限 */
export const removeCollaborationMember = async (sessionId: string, deviceId: string) => {
  return collaborationCommands.removeMember.call(sessionId, deviceId);
};

/** 保存协作服务器地址与昵称 */
export const configureCollaborationServer = async (config: CollaborationServerConfig) => {
  return collaborationCommands.configureServer.call(config);
};

/** 导出协作身份到本地文件 */
export const exportCollaborationIdentity = async () => {
  return collaborationCommands.exportIdentity.call();
};

/** 从本地文件恢复协作身份 */
export const importCollaborationIdentity = async () => {
  return collaborationCommands.importIdentity.call();
};

/** 选择本地内容发起共享，返回共享文档 id 与协作码 */
export const createSharedContent = async (
  contentId: number | string,
  contentType: string,
  sourceId: number | string,
  title?: string
): Promise<SharedContentResult> => {
  return collaborationCommands.createSharedContent.call(contentId, contentType, sourceId, title);
};

/** 生成（或轮换）当前会话的协作码 */
export const generateCollaborationInvitation = async (
  sessionId: string
): Promise<CollaborationInvitation> => {
  return collaborationCommands.generateInvitation.call(sessionId);
};

/** 读取本机缓存的协作码（只读不轮换），无缓存返回 null */
export const getCurrentCollaborationInvitation = async (
  sessionId: string
): Promise<CollaborationInvitation | null> => {
  return collaborationCommands.getCurrentInvitation.call(sessionId);
};

/** 拉取协作全局状态（连接/会话/申请等） */
export const getCollaborationState = async () => {
  return collaborationCommands.state.call();
};

/** 打开共享内容会话，获得可编辑的快照 */
export const openCollaborationContentSession = async (target: ContentSessionTarget) => {
  return collaborationCommands.openContent.call(target);
};

/** 订阅共享文档（Yjs 状态 + awareness + 私有块），返回本机视图快照 */
export const subscribeCollaborationDocument = async (id: string, viewId: string) => {
  return collaborationCommands.subscribe.call(id, viewId);
};

/** 退出本机视图订阅 */
export const unsubscribeCollaborationDocument = async (viewId: string) => {
  return collaborationCommands.unsubscribe.call(viewId);
};

/** 提交一批 Yjs 更新到共享文档 */
export const updateCollaborationDocument = async (
  id: string,
  updates: Uint8Array,
  viewId: string
) => {
  return collaborationCommands.update.call(id, updates, viewId);
};

/** 提交私有块（不进 Y 文档，主进程单独落库） */
export const sendCollaborationPrivateNode = async (
  id: string,
  viewId: string,
  collabId: string,
  node: SharedContent["content"][number]
) => {
  return collaborationCommands.privateNode.call(id, viewId, collabId, node);
};

/** 冻结确认（服务端 freeze 后本机完成落盘的回执） */
export const ackCollaborationFreeze = async (viewId: string) => {
  return collaborationCommands.freezeAck.call(viewId);
};

/** 记录激活 Tab（本机视图状态，随投影落库） */
export const setCollaborationTabActive = async (id: string, collabId: string, value: string) => {
  return collaborationCommands.setTabActive.call(id, collabId, value);
};

/** 上传资源到共享文档，返回资源 URL */
export const uploadCollaborationResource = async (
  id: string,
  payload: CollaborationUploadResourcePayload
) => {
  return collaborationCommands.uploadResource.call(id, payload);
};

/** 解析共享文档资源引用为可访问 URL */
export const resolveCollaborationResource = async (id: string, url: string) => {
  return collaborationCommands.resolveResource.call(id, url);
};

/** 推送本机 awareness 更新（光标/在线状态，fire-and-forget 容错） */
export const sendCollaborationAwareness = async (
  id: string,
  viewId: string,
  update: Uint8Array,
  clientID: number
) => {
  return collaborationCommands.awareness.call(id, viewId, update, clientID);
};
