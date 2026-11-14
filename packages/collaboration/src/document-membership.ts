import { CollaborationError } from "./protocol";

export function leaveDocument(
  document: { owner_id: string; status: "draft" | "active" | "closed" },
  deviceId: string,
  remove: () => void
): void {
  if (document.owner_id === deviceId)
    throw new CollaborationError("OWNER_CANNOT_LEAVE", "作者请结束共享");
  if (document.status === "closed") return;
  if (document.status === "draft")
    throw new CollaborationError("DOCUMENT_CLOSED", "文档尚未发布", 410);
  try {
    remove();
  } catch (error) {
    // 活动房间中已无本人的成员资格时，退出已经完成。
    if (!(error instanceof CollaborationError && error.code === "FORBIDDEN")) throw error;
  }
}
