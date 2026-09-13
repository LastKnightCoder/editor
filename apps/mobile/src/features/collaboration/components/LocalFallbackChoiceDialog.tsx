// 重连后的「保留本机 / 采用云端」裁决弹窗：协作不可用期间本地兜底编辑的改动，
// 在会话恢复时交作者选择。独立于 CollaborativeEditor（裁决是独立用例，编辑器本体
// 不应感知兜底标记的读写细节）。
import { useState } from "react";
import type { ContentNode } from "@tau/collaboration";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { toast } from "../../../components/toast";
import * as tauri from "../../../services/tauri";
import { collaborationManager } from "../core/manager";
import { clearPendingLocalFallback } from "../local-fallback";

export function LocalFallbackChoiceDialog(props: {
  open: boolean;
  documentId: string;
  boundContentId: number | undefined;
  /** 裁决完成（无论保留本机还是采用云端）：调用方解除投影暂停 */
  onResolved: () => void;
}) {
  const [resolving, setResolving] = useState(false);

  /** 保留本机：把本地正文整树推回房间（CRDT 替换，远端看到一次删+插） */
  const keepLocal = async () => {
    if (!props.boundContentId) return;
    setResolving(true);
    try {
      const detail = await tauri.getContentDetail(props.boundContentId);
      collaborationManager.pushLocalContent(props.documentId, detail.content as ContentNode[]);
      clearPendingLocalFallback(props.boundContentId);
      props.onResolved();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "本机改动推回云端失败，请重试");
    } finally {
      setResolving(false);
    }
  };

  /** 采用云端：丢弃本机兜底改动，解除投影暂停后由投影把云端内容写回本地 */
  const adoptCloud = () => {
    if (props.boundContentId) clearPendingLocalFallback(props.boundContentId);
    props.onResolved();
  };

  return (
    <MobileConfirmDialog
      open={props.open}
      title="协作已恢复，本机有离线期间的改动"
      description="「保留本机」会把本机正文推回协作房间（覆盖云端当前内容）；「采用云端」会放弃本机改动，改用房间内容。"
      cancelText="采用云端"
      confirmText="保留本机"
      loading={resolving}
      onCancel={adoptCloud}
      onConfirm={() => void keepLocal()}
    />
  );
}
