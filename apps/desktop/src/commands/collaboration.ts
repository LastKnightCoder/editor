import type { SourceType } from "@tau/collaboration";
import {
  collaborationCommands,
  type CollaborationInvitation,
  type CollaborationSubscribeSnapshot,
  type SharedContentResult,
} from "@/commands/contracts/collaboration";

export type { CollaborationInvitation, CollaborationSubscribeSnapshot, SharedContentResult };

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

/** 修改本机协作昵称（服务器地址不对用户开放） */
export const setCollaborationNickname = async (nickname: string) => {
  return collaborationCommands.setNickname.call(nickname);
};

export const createSharedContent = async (
  contentId: number,
  contentType?: SourceType,
  sourceId?: number,
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
