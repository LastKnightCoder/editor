/** 结束共享 / 退出协作 / 清理本地记录的确认对话框（意图文案由 model.leaveIntent 判定） */

import { ConfirmDialog, toast } from "@tau/ui";
import type { CollaborationSession } from "@tau/collaboration";
import { discardLocalCollaboration, leaveCollaboration } from "@/commands";
import { errorText, leaveIntent } from "./model";

export function LeaveDialog({
  session,
  open,
  onOpenChange,
  onLeft,
}: {
  session: CollaborationSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft?: () => void;
}) {
  const intent = leaveIntent(session);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      danger
      title={intent.title}
      context={session.title || "未命名内容"}
      description={intent.description}
      confirmText={intent.confirmText}
      loadingText="正在处理…"
      confirmDisabled={intent.blocked}
      onConfirm={async () => {
        try {
          if (intent.action === "discard") await discardLocalCollaboration(session.id);
          else await leaveCollaboration(session.id, session.pending);
          onLeft?.();
        } catch (error) {
          toast.error(errorText(error));
          throw error;
        }
      }}
    />
  );
}
