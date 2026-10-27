import { publishWhiteboard } from "@/commands/whiteboard-document";
import { queryClient } from "@/queryClient";
import useCollaborationStore from "@/stores/useCollaborationStore";
import type { WhiteboardShareCandidate } from "@/types/whiteboard-document";
import type { WhiteboardDocumentClient } from "./client";
import { whiteboardShareStatusKey } from "./keys";
import { whiteboardDocumentEntry } from "./registry";

/**
 * 首次共享整块白板的全部页，服务器地址取协作状态。主进程在建房前固定发布任务，
 * 之后的失败由白板页按该任务续做或取消，不会再用新身份重发。
 */
export async function publishWhiteboardClient(
  client: WhiteboardDocumentClient
): Promise<{ documentId: string; serverUrl: string }> {
  if (client.isDisposed || client.needsReopen || !client.leaseId || !client.identity)
    throw new Error("白板会话已关闭");
  try {
    // 预检读取主进程快照，先保证本视图新建的页面和输入已经耐久保存。
    await client.flush();
    if (client.isDisposed || client.needsReopen) throw new Error("白板会话已变化，请重试");
    return await publishWhiteboard(client.leaseId, {
      operationId: crypto.randomUUID(),
      serverUrl: useCollaborationStore.getState().serverUrl,
      pageIds: client.model.read().pages.map(page => page.id),
    });
  } finally {
    void queryClient.invalidateQueries({
      queryKey: whiteboardShareStatusKey(client.target.databaseName, client.identity.documentId),
    });
  }
}

/** 白板页之外发起共享：临时持有白板文档会话，发布完成后随最后一个持有者释放。 */
export async function shareWhiteboardCandidate(
  databaseName: string,
  candidate: WhiteboardShareCandidate
): Promise<{ documentId: string; serverUrl: string }> {
  const entry = whiteboardDocumentEntry(
    { databaseName, contentId: candidate.contentId },
    candidate.documentId
  );
  const release = entry.retain();
  try {
    return await publishWhiteboardClient(await entry.open());
  } finally {
    release();
  }
}
