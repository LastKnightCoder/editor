import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { ContentNode } from "@tau/collaboration";

export interface EditorCollaborationBinding {
  mode?: "local" | "shared";
  /** 本机在会话中的角色，本机会话视为 owner；决定 content-link 等本机数据的可用性。 */
  role?: "owner" | "editor";
  viewId?: string;
  flushLocal?: () => void;
  doc: Y.Doc;
  root?: Y.XmlText;
  awareness: Awareness;
  origin: object;
  /** 白板、数据库等本地实体块的数据，按 collabId 保存，不进入共享文档。 */
  privateNodes: Map<string, ContentNode>;
  /** 共享模式下插入私有块后通知宿主持久化私有数据。 */
  putPrivateNode?: (collabId: string, node: ContentNode) => void;
  uploadResource: (file: File) => Promise<string>;
  resolveResource: (url: string) => Promise<string>;
}
