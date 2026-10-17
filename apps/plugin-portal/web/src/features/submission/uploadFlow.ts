import type { Upload } from "../../../../contracts";
import { asPortalError, hasCode } from "../../api/errors";
import type { PortalApi } from "../../api/types";

/** 传输中的临时阶段：字节发完但响应未到即「校验中」 */
export type UploadPhase =
  | { phase: "preparing" }
  | { phase: "uploading"; loaded: number; total: number }
  | { phase: "verifying" };

/** 核对原因：用户取消，或网络中断导致结果未知 */
export type ConfirmReason = "canceled" | "unknown";

export type UploadOutcome =
  | { type: "ready"; upload: Upload }
  /** 取消时服务端已完成并通过校验，由用户决定是否仍然使用 */
  | { type: "canceled-ready"; upload: Upload }
  | { type: "canceled" }
  | { type: "invalid"; message: string }
  | { type: "failed"; message: string }
  /** 服务端仍在接收/校验，需要稍后再次核对 */
  | { type: "pending"; uploadId: string; reason: ConfirmReason }
  /** 无法读取上传状态（如网络仍不可用），保留 ID 供重新核对 */
  | { type: "unconfirmed"; uploadId: string; reason: ConfirmReason; message: string };

export function outcomeFromUpload(upload: Upload, reason: ConfirmReason): UploadOutcome {
  switch (upload.status) {
    case "ready":
      return reason === "canceled" ? { type: "canceled-ready", upload } : { type: "ready", upload };
    case "checking":
      return { type: "pending", uploadId: upload.id, reason };
    case "invalid":
      return reason === "canceled"
        ? { type: "canceled" }
        : { type: "invalid", message: upload.error?.message ?? "文件未通过校验" };
    case "awaiting_upload":
      return reason === "canceled"
        ? { type: "canceled" }
        : { type: "failed", message: "上传没有完成，请重新选择文件" };
  }
}

/** 取消或网络中断后读取 Upload，确认服务端的真实结果 */
export async function confirmUpload(
  api: PortalApi,
  uploadId: string,
  reason: ConfirmReason
): Promise<UploadOutcome> {
  try {
    return outcomeFromUpload(await api.getUpload(uploadId), reason);
  } catch (error) {
    return {
      type: "unconfirmed",
      uploadId,
      reason,
      message: `暂时无法确认上传结果：${asPortalError(error).message}`,
    };
  }
}

export async function runUpload(
  api: PortalApi,
  file: File,
  { signal, onPhase }: { signal: AbortSignal; onPhase: (phase: UploadPhase) => void }
): Promise<UploadOutcome> {
  onPhase({ phase: "preparing" });
  let ticket;
  try {
    ticket = await api.createUpload({ fileName: file.name, size: file.size });
  } catch (error) {
    return { type: "failed", message: asPortalError(error).message };
  }
  // 申请到地址前取消：还没有发送任何字节
  if (signal.aborted) return { type: "canceled" };

  const uploadId = ticket.upload.id;
  const transfer = api.sendUpload(ticket, file, ({ loaded, total }) =>
    onPhase(
      total > 0 && loaded >= total ? { phase: "verifying" } : { phase: "uploading", loaded, total }
    )
  );
  const abort = () => transfer.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const upload = await transfer.result;
    if (upload.status === "checking") return confirmUpload(api, uploadId, "unknown");
    return outcomeFromUpload(upload, "unknown");
  } catch (error) {
    if (hasCode(error, "ABORTED")) return confirmUpload(api, uploadId, "canceled");
    // 网络中断或 409（服务端已在处理该上传）：结果未知，读取核对
    if (hasCode(error, "NETWORK_ERROR", "UPLOAD_STATE_CONFLICT"))
      return confirmUpload(api, uploadId, "unknown");
    if (hasCode(error, "INVALID_PACKAGE")) {
      return { type: "invalid", message: asPortalError(error).message };
    }
    return { type: "failed", message: asPortalError(error).message };
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
