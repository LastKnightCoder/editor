import { command } from "@tau/rpc";
import type {
  CollaborationSession,
  CollaborationState,
  ContentSessionSnapshot,
  ContentSessionTarget,
  SharedContent,
} from "@tau/collaboration";

export interface SharedContentResult {
  documentId: string;
  /** 创建成功即返回协作码，供发起方直接分享 */
  code: string;
}

export interface CollaborationInvitation {
  code: string;
  expiresAt: number;
}

/** 订阅共享内容获得的本机会话快照 */
export interface CollaborationSubscribeSnapshot {
  state: Uint8Array;
  awareness?: Uint8Array;
  privateNodes: [string, SharedContent["content"][number]][];
  session: CollaborationSession;
  user: { id: string; name: string; color: string };
}

export interface CollaborationUploadResourcePayload {
  name: string;
  mime: string;
  bytes: Uint8Array;
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
  state: command<[], CollaborationState>("collaboration:state"),
  openContent: command<[ContentSessionTarget], ContentSessionSnapshot>(
    "collaboration:open-content"
  ),
  subscribe: command<[string, string], CollaborationSubscribeSnapshot>("collaboration:subscribe"),
  unsubscribe: command<[string], void>("collaboration:unsubscribe"),
  update: command<[string, Uint8Array, string], void>("collaboration:update"),
  privateNode: command<[string, string, string, SharedContent["content"][number]], void>(
    "collaboration:private-node"
  ),
  freezeAck: command<[string], void>("collaboration:freeze-ack"),
  setTabActive: command<[string, string, string], void>("collaboration:set-tab-active"),
  uploadResource: command<[string, CollaborationUploadResourcePayload], string>(
    "collaboration:upload-resource"
  ),
  resolveResource: command<[string, string], string>("collaboration:resource"),
  awareness: command<[string, string, Uint8Array, number], void>("collaboration:awareness"),
};
