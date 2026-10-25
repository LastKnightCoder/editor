// 协作编辑视图的标准组合（设计稿 03）：文档绑定（含失败重试）+ presence 上报 +
// owner 侧投影 + 稳定状态徽标。详情页原地编辑与独立协作编辑页共用，
// 避免两页各自拼装四个 hook 与派生逻辑。
import type { ContentCollaborationBinding } from "@tau/editor-collab";
import useCollaborationDocument from "./useCollaborationDocument";
import useCollaborationPresence from "./useCollaborationPresence";
import { useCollabProjection } from "./useCollabProjection";
import { useStableSessionStatus, type SessionStatus } from "../session-status";
import type { CollaborationSession } from "@tau/collaboration";

export function useCollabSession(
  documentId: string,
  options?: {
    /** 暂停投影（重连后有本地兜底改动待作者选择时） */
    projectionPaused?: boolean;
  }
) {
  const { binding, document, session, loading, error, frozen, boundContentId, ended, retry } =
    useCollaborationDocument(documentId);
  const readonly = frozen || !binding || (session ? session.status !== "active" : false);
  const presence = useCollaborationPresence(binding, readonly);
  useCollabProjection(binding, boundContentId, options?.projectionPaused);
  const status = useStableSessionStatus(session);
  const online = (session?.members ?? []).filter(member => member.online);
  const offline = session?.connection === "offline" || session?.connection === "error";
  return {
    document,
    binding: binding as ContentCollaborationBinding | undefined,
    session: session as CollaborationSession | undefined,
    loading,
    error,
    frozen,
    boundContentId,
    ended,
    /** 会话建立失败后的手动重试（「重试连接」入口） */
    retry,
    readonly,
    presence,
    status: status as SessionStatus | undefined,
    online,
    offline,
  };
}
