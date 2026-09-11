import {
  collaborationCommands,
  type CollaborationInvitation,
  type CollaborationServerConfig,
  type SharedContentResult,
} from "@/commands/contracts/collaboration";

export type { CollaborationInvitation, CollaborationServerConfig, SharedContentResult };

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
export const discardLocalCollaboration = async (sessionId: string, pending?: boolean) => {
  return collaborationCommands.discardLocal.call(sessionId, pending);
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
