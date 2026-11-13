import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { ContentNode } from "@tau/collaboration";
import type { TextFieldSnapshot } from "@tau/editor/source-contracts";

export interface ContentCollaborationBinding {
  prepareFragment?: (
    sourceDocumentId: string,
    content: ContentNode[],
    contracts: import("@tau/db-schema/content-contracts").ContentContractDictionary
  ) => Promise<ContentNode[]>;
  /** 跨文档移动使用宿主持久会话确认源与目标的待提交写入。 */
  flushFragmentWrites?: () => Promise<void>;
  nodeViews?: import("@tau/editor/source-contracts").EditorNodeViews;
  preserveInputDraft?: (nodeId: string, field: string, draft: TextFieldSnapshot) => void;
  mode?: "local" | "shared";
  /** 本机在会话中的角色，本机会话视为 owner；决定 content-link 等本机数据的可用性。 */
  role?: "owner" | "editor";
  viewId?: string;
  /** 由文档源在连接期间挂上：把编辑器里尚未写入 Y.Doc 的本地改动立即写入 */
  flushLocal?: () => void;
  doc: Y.Doc;
  awareness: Awareness;
  /** 本地写入标识（区分本机改动与远端更新）；换源时由编辑器改写为它已有的 origin */
  origin: object;
  uploadResource: (file: File) => Promise<string>;
  /** 宿主上传完成后，将本地路径转换为共享引用，公网地址保持不变。 */
  prepareResource?: (reference: string) => Promise<string>;
  resolveResource: (url: string) => Promise<string>;
}
