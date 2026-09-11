import { command } from "@tau/rpc";

export interface SharedContentResult {
  documentId: string;
  /** 创建成功即返回协作码，供发起方直接分享 */
  code: string;
}

export interface CollaborationInvitation {
  code: string;
  expiresAt: number;
}

export interface CollaborationServerConfig {
  serverUrl: string;
  nickname: string;
}

/** 协作域命令契约（主进程注册于 collaboration/ipc-controller，模式 A 直连注册） */
export const collaborationCommands = {
  join: command<[string], void>("collaboration:join"),
  decide: command<[string, boolean], void>("collaboration:decide"),
  leave: command<[string, (boolean | undefined)?], void>("collaboration:leave"),
  discardLocal: command<[string, (boolean | undefined)?], void>("collaboration:discard-local"),
  removeMember: command<[string, string], void>("collaboration:remove-member"),
  configureServer: command<[CollaborationServerConfig], void>("collaboration:configure"),
  exportIdentity: command<[], void>("collaboration:export-identity"),
  importIdentity: command<[], void>("collaboration:import-identity"),
  createSharedContent: command<
    [number | string, string, number | string, (string | undefined)?],
    SharedContentResult
  >("collaboration:create-content"),
  generateInvitation: command<[string], CollaborationInvitation>("collaboration:invitation"),
  getCurrentInvitation: command<[string], CollaborationInvitation | null>(
    "collaboration:invitation-current"
  ),
};
