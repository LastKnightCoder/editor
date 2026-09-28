import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { ContentNode } from "@tau/collaboration";

export interface EditorCollaborationBinding {
  mode?: "local" | "shared";
  /** 本机在会话中的角色，本机会话视为 owner；决定 content-link 等本机数据的可用性。 */
  role?: "owner" | "editor";
  viewId?: string;
  /** 由文档源在连接期间挂上：把编辑器里尚未写入 Y.Doc 的本地改动立即写入 */
  flushLocal?: () => void;
  doc: Y.Doc;
  root?: Y.XmlText;
  awareness: Awareness;
  /** 本地写入标识（区分本机改动与远端更新）；换源时由编辑器改写为它已有的 origin */
  origin: object;
  /** 白板、数据库等本地实体块的数据，按 collabId 保存，不进入共享文档。 */
  privateNodes: Map<string, ContentNode>;
  /** 共享模式下插入私有块后通知宿主持久化私有数据。 */
  putPrivateNode?: (collabId: string, node: ContentNode) => void;
  /** 本机字段（LOCAL_FIELDS）变更时回调，宿主可借以上报视图状态（如激活 Tab） */
  onLocalFieldChange?: (collabId: string, key: string, value: unknown) => void;
  uploadResource: (file: File) => Promise<string>;
  resolveResource: (url: string) => Promise<string>;
}
