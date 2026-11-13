import { command } from "@tau/rpc";
import type {
  CollaborationImageFile,
  OwnerImageReply,
} from "../../../shared/collaboration-image-storage";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type {
  CollaborationSession,
  CollaborationState,
  ContentSessionSnapshot,
  ContentSessionTarget,
  ContentInputDraft,
  ContentNode,
  NodeDocumentIdentity,
  JoinRequestResult,
  SourceType,
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
  /** 正文身份独立于本机订阅会话 ID。 */
  documentIdentity: NodeDocumentIdentity;
  nodeViews?: Record<string, Record<string, unknown>>;
  state: Uint8Array;
  awareness?: Uint8Array;
  session: CollaborationSession;
  user: { id: string; name: string; color: string };
}

/** 协作域命令契约（主进程注册于 collaboration/ipc-controller，模式 A 直连注册） */
export const collaborationCommands = {
  prepareFragment: command<
    [string, string, ContentNode[], ContentContractDictionary],
    ContentNode[]
  >("collaboration:prepare-fragment"),
  updateNodeView: command<[string, string, Record<string, unknown>], Record<string, unknown>>(
    "collaboration:node-view"
  ),
  join: command<[string], JoinRequestResult>("collaboration:join"),
  decide: command<[string, boolean], void>("collaboration:decide"),
  leave: command<[string, (boolean | undefined)?], void>("collaboration:leave"),
  discardLocal: command<[string], void>("collaboration:discard-local"),
  removeMember: command<[string, string], void>("collaboration:remove-member"),
  setNickname: command<[string], CollaborationState>("collaboration:set-nickname"),
  createSharedContent: command<[number, SourceType?, number?, string?], SharedContentResult>(
    "collaboration:create-content"
  ),
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
  inputDraft: command<[string, ContentInputDraft], void>("collaboration:input-draft"),
  documentDraft: command<[string, { state: Uint8Array; sequence: number }], void>(
    "collaboration:document-draft"
  ),
  freezeAck: command<[string, string?], void>("collaboration:freeze-ack"),
  prepareResource: command<[string, string], string>("collaboration:prepare-resource"),
  uploadSharedResource: command<[string, CollaborationImageFile], string>(
    "collaboration:upload-shared-resource"
  ),
  ownerImageConnect: command<[string], void>("collaboration:owner-image-connect"),
  ownerImageRelease: command<[string], void>("collaboration:owner-image-release"),
  ownerImageReply: command<[OwnerImageReply], void>("collaboration:owner-image-reply"),
  resolveResource: command<[string, string], string>("collaboration:resource"),
  awareness: command<[string, string, Uint8Array, number], void>("collaboration:awareness"),
};

export const localContentCommands = {
  prepareFragment: command<
    [string, string, ContentNode[], ContentContractDictionary],
    ContentNode[]
  >("local-content:prepare-fragment"),
  updateNodeView: command<[string, string, Record<string, unknown>], Record<string, unknown>>(
    "local-content:node-view"
  ),
  openContent: command<[ContentSessionTarget], ContentSessionSnapshot>(
    "local-content:open-content"
  ),
  subscribe: command<[string, string], CollaborationSubscribeSnapshot>("local-content:subscribe"),
  unsubscribe: command<[string], void>("local-content:unsubscribe"),
  update: command<[string, Uint8Array, string], void>("local-content:update"),
  inputDraft: command<[string, ContentInputDraft], void>("local-content:input-draft"),
  documentDraft: command<[string, { state: Uint8Array; sequence: number }], void>(
    "local-content:document-draft"
  ),
  freezeAck: command<[string, string?], void>("local-content:freeze-ack"),
  prepareResource: command<[string, string], string>("local-content:prepare-resource"),
  uploadSharedResource: command<[string, CollaborationImageFile], string>(
    "local-content:upload-shared-resource"
  ),
  resolveResource: command<[string, string], string>("local-content:resource"),
  awareness: command<[string, string, Uint8Array, number], void>("local-content:awareness"),
};
